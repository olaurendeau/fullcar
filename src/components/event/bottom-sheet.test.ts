import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SheetBar } from "./bottom-sheet";

describe("SheetBar", () => {
  it("out of a BottomSheet, throws instead of showing its buttons nowhere", () => {
    expect(() => renderToStaticMarkup(createElement(SheetBar, null, createElement("button", null, "Valider")))).toThrow(
      "SheetBar is rendered out of a BottomSheet",
    );
  });
});
