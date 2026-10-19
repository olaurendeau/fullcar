import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReadButton } from "./read-button";

/** The button's own press, as React would call it: no screen, no state around it. */
function press(reading: boolean) {
  const onRead = vi.fn();
  const button = ReadButton({ reading, onRead, children: "Actualiser" }) as ReactElement<{ onClick: () => void }>;
  button.props.onClick();
  return onRead;
}

describe("ReadButton", () => {
  // O5.8, O1.8: aria-disabled, not disabled, so the press reaches it; it starts nothing.
  it("starts nothing on a press while it reads", () => {
    expect(press(true)).not.toHaveBeenCalled();
  });

  it("reads on a press otherwise", () => {
    expect(press(false)).toHaveBeenCalledOnce();
  });
});
