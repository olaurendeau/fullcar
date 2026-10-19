import { describe, expect, it } from "vitest";
import { coverPage, whenPageShown } from "./hidden-page";

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
