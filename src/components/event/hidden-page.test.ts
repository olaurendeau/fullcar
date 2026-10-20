import { describe, expect, it } from "vitest";
import type { Withdrawal } from "./bar-state";
import { coverPage, forget, onWithdraw, sendAbout, whenPageShown } from "./hidden-page";

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
