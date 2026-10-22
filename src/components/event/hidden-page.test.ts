import { describe, expect, it } from "vitest";
import { covers, personLeg, type Withdrawal } from "./bar-state";
import { aboutOf, allerPart, coverPage, forget, offersRetour, onWithdraw, sendAbout, whenPageShown } from "./hidden-page";

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

  it("sends(fields, subjects): each subject, then each of its fields", () => {
    expect(aboutOf(["person:tom"])).toEqual(["person:tom"]);
    expect(aboutOf(["person:tom"], ["firstName", "phone"])).toEqual(["person:tom", "person:tom:firstName", "person:tom:phone"]);
    expect(aboutOf(["offer:aller:new:Marc", "offer:retour:new:Marc"])).toEqual(["offer:aller:new:Marc", "offer:retour:new:Marc"]);
  });

  // « Le sujet d’un échec », line « Proposer une voiture »: one subject per leg of the offer (#228).
  it("an offer on both legs is withdrawn by one on both, in either order; neither by one on a leg, nor by another driver's", async () => {
    const uncover = coverPage();
    const said: string[] = [];
    const both = ["offer:aller:new:Marc", "offer:retour:new:Marc"];
    sendAbout(aboutOf(both)).whenClosed(() => said.push("both"));
    sendAbout(aboutOf(["offer:aller:new:Marc"])).whenClosed(() => said.push("aller"));
    sendAbout(aboutOf(["offer:retour:new:Marc", "offer:aller:claire"]));
    sendAbout(aboutOf(["offer:aller:claire"]));
    uncover();
    await settled();
    expect(said).toEqual(["both", "aller"]);

    const again = coverPage();
    sendAbout(aboutOf(both)).whenClosed(() => said.push("both again"));
    sendAbout(aboutOf([...both].reverse()));
    again();
    await settled();
    expect(said).toEqual(["both", "aller"]);
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
    expect(aboutOf(["seats:sophie"], ["tom", "lea"])).toEqual(["seats:sophie", "seats:sophie:tom", "seats:sophie:lea"]);
    expect(aboutOf(["seats:sophie"])).toEqual(["seats:sophie"]);
  });

  it("a tap for Tom alone withdraws no failure of Tom and Léa; a send of both does", () => {
    const told: Withdrawal[] = [];
    const stop = onWithdraw((withdrawal) => told.push(withdrawal));
    sendAbout(aboutOf(["seats:sophie"], ["tom"]));
    sendAbout(aboutOf(["seats:sophie"], ["tom", "lea"]));
    stop();
    const failed = { about: aboutOf(["seats:sophie"], ["tom", "lea"]), sent: 0 };
    expect(told.map((withdrawal) => covers(withdrawal, failed))).toEqual([false, true]);
  });
});

// « Le sujet d’un échec », line « Proposer une voiture » (event-board v4.4.4, B1.7).
describe("an offer's legs", () => {
  const both = aboutOf(["offer:aller:claire", "offer:retour:claire"]);

  it("a failure `noRetourAgain` is about its aller part alone, which the aller sent again covers", () => {
    expect(allerPart(both)).toEqual(["offer:aller:claire"]);
    expect(covers({ about: ["offer:aller:claire"] }, { about: allerPart(both), sent: 1 })).toBe(true);
    expect(covers({ about: ["offer:aller:claire"] }, { about: both, sent: 1 })).toBe(false);
    expect(allerPart(["person:new:Inès"])).toEqual(["person:new:Inès"]);
  });

  it("an offer is about the retour when one of its subjects is the retour's", () => {
    expect([both, ["offer:retour:new:Marc"], ["offer:aller:claire"], ["cell:tom:retour"]].map(offersRetour)).toEqual([true, true, false, false]);
  });
});

// Rule 2, v4.4.5 (#359): a placement's success held under a sheet is never written once a send
// made after it has succeeded in changing one of its persons on its leg.
describe("whenStillTrue", () => {
  it("a send made since that succeeded for Tom on that leg: never said, nor for Léa with him", async () => {
    const [tom, lea] = [personLeg("tom-1", "aller"), personLeg("lea-1", "aller")];
    const uncover = coverPage();
    const said: string[] = [];
    const placed = sendAbout(["seats:sophie"]);
    placed.changed([tom, lea]);
    sendAbout(["cell:tom-1:aller"]).changed([tom]);
    placed.whenStillTrue([tom, lea], () => said.push("Tom et Léa"));
    uncover();
    await settled();
    expect(said).toEqual([]);
  });

  it("a send made since that failed, or one for another person or on the other leg: said once the page shows (v4.4.5-2, -3)", async () => {
    const lea = personLeg("lea-2", "aller");
    const uncover = coverPage();
    const said: string[] = [];
    const placed = sendAbout(["seats:sophie"]);
    placed.changed([lea]);
    // Failed or refused: it left, and its answer changed nothing.
    sendAbout(["cell:lea-2:aller"]).leaves();
    sendAbout(["cell:hugo-2:aller"]).changed([personLeg("hugo-2", "aller")]);
    sendAbout(["cell:lea-2:retour"]).changed([personLeg("lea-2", "retour")]);
    placed.whenStillTrue([lea], () => said.push("Léa"));
    expect(said).toEqual([]);
    uncover();
    await settled();
    expect(said).toEqual(["Léa"]);
  });

  it("decided once the page shows: a send for Tom that succeeds while it waits withdraws it", async () => {
    const tom = personLeg("tom-3", "aller");
    const uncover = coverPage();
    const said: string[] = [];
    const placed = sendAbout(["seats:marc"]);
    placed.whenStillTrue([tom], () => said.push("Tom"));
    sendAbout(["cell:tom-3:aller"]).changed([tom]);
    uncover();
    await settled();
    expect(said).toEqual([]);
  });

  // Sends shaped as « Annuler » (rule 6): `undo:{rideId}`, then who it gives back, if anyone.
  it("an « Annuler » sent since that gave Tom back on that leg: Tom's success is never said; a placement sent after it is", async () => {
    const [tom, back] = [personLeg("tom-5", "aller"), personLeg("tom-5", "retour")];
    const uncover = coverPage();
    const said: string[] = [];
    const placed = sendAbout(aboutOf(["seats:sophie-5"], ["tom-5"]));
    placed.changed([tom]);
    placed.whenStillTrue([tom], () => said.push("Tom, before the undo"));
    sendAbout(aboutOf(["undo:sophie-5"], ["tom-5"])).changed([tom]);
    // At the retour: of the sends made since Tom's success, only the « Annuler » changed him at the aller.
    const again = sendAbout(aboutOf(["seats:paul-5"], ["tom-5"]));
    again.changed([back]);
    again.whenStillTrue([back], () => said.push("Tom, after the undo"));
    uncover();
    await settled();
    expect(said).toEqual(["Tom, after the undo"]);
  });

  it("an « Annuler » sent since that gave nobody back: the success it alone comes after is said", async () => {
    const lea = personLeg("lea-6", "aller");
    const uncover = coverPage();
    const said: string[] = [];
    const placed = sendAbout(aboutOf(["seats:sophie-6"], ["lea-6"]));
    placed.changed([lea]);
    placed.whenStillTrue([lea], () => said.push("Léa"));
    sendAbout(aboutOf(["undo:sophie-6"], ["lea-6"])).changed([]);
    uncover();
    await settled();
    expect(said).toEqual(["Léa"]);
  });

  it("a send made before it, answered after it: it is said, at once with no sheet", () => {
    const zoe = personLeg("zoe-4", "aller");
    const said: string[] = [];
    const before = sendAbout(["cell:zoe-4:aller"]);
    const placed = sendAbout(["seats:paul"]);
    before.changed([zoe]);
    placed.whenStillTrue([zoe], () => said.push("Zoé"));
    expect(said).toEqual(["Zoé"]);
  });
});
