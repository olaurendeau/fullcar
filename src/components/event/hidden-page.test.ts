import { describe, expect, it } from "vitest";
import { covers, type Withdrawal } from "./bar-state";
import { aboutOf, coverPage, forget, onWithdraw, sendAbout, whenPageShown } from "./hidden-page";

/** Once the microtask a sheet leaves at its unmount has run. */
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("whenPageShown (#167)", () => {
  it("runs at once when no sheet hides the page", () => {
    const said: string[] = [];
    whenPageShown(() => said.push("Tom"));
    expect(said).toEqual(["Tom"]);
  });

  it("keeps every message that waits, and runs each once, in order, when the page shows", async () => {
    const uncover = coverPage();
    const said: string[] = [];
    whenPageShown(() => said.push("Zed"));
    whenPageShown(() => said.push("Tom"));
    await settled();
    expect(said).toEqual([]);

    uncover();
    await settled();
    expect(said).toEqual(["Zed", "Tom"]);
    const again = coverPage();
    again();
    await settled();
    expect(said).toEqual(["Zed", "Tom"]);
  });

  it("withdraws a message alone: the others still wait", async () => {
    const uncover = coverPage();
    const said: string[] = [];
    const withdrawZed = whenPageShown(() => said.push("Zed"));
    whenPageShown(() => said.push("Tom"));
    withdrawZed();
    withdrawZed();

    uncover();
    await settled();
    expect(said).toEqual(["Tom"]);
  });

  it("waits while a sheet that took the closing one's place hides the page", async () => {
    const closing = coverPage();
    const said: string[] = [];
    whenPageShown(() => said.push("Tom"));
    // In one commit: the closing sheet unmounts, the reopened one mounts.
    closing();
    const reopened = coverPage();
    await settled();
    expect(said).toEqual([]);

    reopened();
    await settled();
    expect(said).toEqual(["Tom"]);
  });

  it("rule 7 of « Lecteurs d’écran »: released together, the failures run first, each lane in order", async () => {
    const uncover = coverPage();
    const said: string[] = [];
    whenPageShown(() => said.push("Hugo placed"));
    whenPageShown(() => said.push("Sophie failed"), true);
    const withdrawn = whenPageShown(() => said.push("Paul failed"), true);
    whenPageShown(() => said.push("Marc failed"), true);
    withdrawn();
    uncover();
    await settled();
    expect(said).toEqual(["Sophie failed", "Marc failed", "Hugo placed"]);
  });
});

describe("sendAbout (#208, #216)", () => {
  /** Records what the bar is told to withdraw, while `run` runs. */
  function withdrawals(run: () => void) {
    const told: Withdrawal[] = [];
    const stop = onWithdraw((withdrawal) => told.push(withdrawal));
    run();
    stop();
    return told;
  }

  it("withdraws as it is sent, from the bar too; its answer, only what earlier sends left", () => {
    const about = ["seats:sophie", "seats:sophie:tom"];
    let first: ReturnType<typeof sendAbout> | undefined;
    const told = withdrawals(() => {
      first = sendAbout(about);
      first.answered();
    });
    expect(told).toEqual([{ about }, { about, before: first!.seq }]);
    expect(sendAbout(about).seq).toBeGreaterThan(first!.seq);
  });

  it("a late answer leaves waiting the failure of a send made since", async () => {
    const about = ["ride:claire:edit", "ride:claire:edit:note"];
    const uncover = coverPage();
    const said: string[] = [];
    const late = sendAbout(about);
    const since = sendAbout(about);
    since.whenClosed(() => said.push("since"));
    late.answered();
    uncover();
    await settled();
    expect(said).toEqual(["since"]);
  });

  it("a failure that comes after a send that covers it is never said; a success is, and a send of part of it does not", async () => {
    const about = ["seats:sophie", "seats:sophie:tom", "seats:sophie:lea"];
    const uncover = coverPage();
    const said: string[] = [];
    const first = sendAbout(about);
    const partial = sendAbout(["person:tom", "person:tom:firstName", "person:tom:phone"]);
    // The sheet reopened, and the same seats sent again: the first send's failure comes after.
    sendAbout([...about, "seats:sophie:hugo"]).leaves();
    sendAbout(["person:tom", "person:tom:phone"]).leaves();
    first.whenClosed(() => said.push("first failed"), true);
    first.whenClosed(() => said.push("first placed"));
    partial.whenClosed(() => said.push("partial failed"), true);
    uncover();
    await settled();
    expect(said).toEqual(["partial failed", "first placed"]);
  });

  it("a send that covers a failure but never leaves, dropped while the first is on its way: the failure is said", async () => {
    const about = ["cell:tom:aller"];
    const uncover = coverPage();
    const said: string[] = [];
    const first = sendAbout(about);
    first.leaves();
    sendAbout(about);
    first.whenClosed(() => said.push("first failed"), true);
    uncover();
    await settled();
    expect(said).toEqual(["first failed"]);
  });

  it("a send that carries only part of a failure's fields leaves it waiting; one that carries them all withdraws it", async () => {
    const uncover = coverPage();
    const said: string[] = [];
    sendAbout(["person:tom", "person:tom:firstName", "person:tom:phone"]).whenClosed(() => said.push("Tom"));
    sendAbout(["person:tom", "person:tom:phone"]);
    sendAbout(["person:lea", "person:lea:firstName", "person:lea:phone"]).whenClosed(() => said.push("Léa"));
    sendAbout(["person:lea", "person:lea:firstName", "person:lea:phone"]);
    uncover();
    await settled();
    expect(said).toEqual(["Tom"]);
  });

  it("a car removed: what was sent about it, waiting or on its way, is never said; what is sent since is", async () => {
    const uncover = coverPage();
    const said: string[] = [];
    sendAbout(["seats:gone", "seats:gone:tom"]).whenClosed(() => said.push("waiting"));
    const onItsWay = sendAbout(["ride:gone:edit", "ride:gone:edit:note"]);
    sendAbout(["seats:kept", "seats:kept:tom"]).whenClosed(() => said.push("another car"));
    const told = withdrawals(() => forget(["seats:gone", "ride:gone:edit"]));
    onItsWay.whenClosed(() => said.push("on its way"));
    sendAbout(["seats:gone", "seats:gone:lea"]).whenClosed(() => said.push("since"));
    uncover();
    await settled();
    expect(said).toEqual(["another car", "since"]);
    expect(told).toEqual([{ gone: ["seats:gone", "ride:gone:edit"], before: onItsWay.seq + 2 }]);
  });
});

// « Le sujet d'un échec », line « un tap ; la feuille »: a tap and the sheet send about the same car and persons (#92).
describe("aboutOf", () => {
  it("names the subject, then each field under it", () => {
    expect(aboutOf("seats:sophie", ["tom", "lea"])).toEqual(["seats:sophie", "seats:sophie:tom", "seats:sophie:lea"]);
    expect(aboutOf("seats:sophie")).toEqual(["seats:sophie"]);
  });

  it("a tap for Tom alone withdraws no failure of Tom and Léa; a send of both does", () => {
    const told: Withdrawal[] = [];
    const stop = onWithdraw((withdrawal) => told.push(withdrawal));
    sendAbout(aboutOf("seats:sophie", ["tom"]));
    sendAbout(aboutOf("seats:sophie", ["tom", "lea"]));
    stop();
    const failed = { about: aboutOf("seats:sophie", ["tom", "lea"]), sent: 0 };
    expect(told.map((withdrawal) => covers(withdrawal, failed))).toEqual([false, true]);
  });
});
