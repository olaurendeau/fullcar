import { afterEach, describe, expect, it } from "vitest";
import { deviceRemovals, type DeviceRemovals } from "./removal-channel";

// remove-person v2, « Focus, barre, envoi », RP5.3: `removedElsewhere` once per person, never for a
// removal this page sent, nor one another tab of the same device sent; nothing stored.

const opened: DeviceRemovals[] = [];
const tab = (eventId = "k7Qm2xPa") => {
  const removals = deviceRemovals(eventId);
  opened.push(removals);
  return removals;
};
afterEach(() => {
  for (const removals of opened.splice(0)) removals.close();
});

/** Once what a tab posted has reached the others: a channel of the same name hears it, then a task later. */
async function delivered(eventId = "k7Qm2xPa") {
  const ear = new BroadcastChannel(`fullcar:removals:${eventId}`);
  await new Promise((resolve) => (ear.onmessage = resolve));
  ear.close();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("deviceRemovals", () => {
  it("a person gone, removed elsewhere: news once, then never again", () => {
    const removals = tab();
    expect(removals.news(["marc"])).toEqual(["marc"]);
    expect(removals.news(["marc"])).toEqual([]);
    expect(removals.news(["lea", "marc", "tom"])).toEqual(["lea", "tom"]);
  });

  it("a removal this page sent is no news, alreadyRemoved included", () => {
    const removals = tab();
    removals.sending("lea");
    expect(removals.news(["lea", "tom"])).toEqual(["tom"]);
  });

  it("a person a refusal `personGone` names is no news: its failure says it (RP5.4)", () => {
    const removals = tab();
    removals.named(["tom"]);
    expect(removals.news(["tom", "marc"])).toEqual(["marc"]);
  });

  it("a removal the server refused: her removal by someone else, later, is news", () => {
    const removals = tab();
    removals.sending("lea");
    removals.refused("lea");
    expect(removals.news(["lea"])).toEqual(["lea"]);
  });

  it("a removal another tab of the device sent is no news there; refused, it is again", async () => {
    const [a, b] = [tab(), tab()];
    const heard = delivered();
    a.sending("lea");
    await heard;
    expect(b.news(["lea"])).toEqual([]);

    const [c, d] = [tab(), tab()];
    const sent = delivered();
    c.sending("tom");
    await sent;
    const refused = delivered();
    c.refused("tom");
    await refused;
    expect(d.news(["tom"])).toEqual(["tom"]);
  });

  it("a removal sent for another event is news on this one", async () => {
    const [other, here] = [tab("Zr4Tq8Lm"), tab()];
    const heard = delivered("Zr4Tq8Lm");
    other.sending("lea");
    await heard;
    expect(here.news(["lea"])).toEqual(["lea"]);
  });

  it("what another tab posts that is not a removal is ignored", async () => {
    const removals = tab();
    const stranger = new BroadcastChannel("fullcar:removals:k7Qm2xPa");
    const heard = delivered();
    stranger.postMessage({ personId: 7, sending: true });
    stranger.postMessage("lea");
    await heard;
    stranger.close();
    expect(removals.news(["lea"])).toEqual(["lea"]);
  });

  it("without BroadcastChannel, this page's own removals are still no news", () => {
    const removals = deviceRemovals("k7Qm2xPa", () => undefined);
    removals.sending("lea");
    expect(removals.news(["lea", "tom"])).toEqual(["tom"]);
    removals.close();
  });
});
