import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QrCode } from "./qr-code";

const TAIL = "abcdefghijklmnopqrstuv";
const LINK = `https://fullcar.example/e/AbCdEfGh/moi#${TAIL}`;

describe("QrCode", () => {
  const html = renderToStaticMarkup(createElement(QrCode, { text: LINK, label: "QR code de votre lien" }));

  it("is one image with its label, one path, on a light ground", () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="QR code de votre lien"');
    expect(html).toContain('shape-rendering="crispEdges"');
    expect(html.match(/<path /g)).toHaveLength(1);
    expect(html).toContain('fill="#fff"');
  });

  it("carries the text nowhere", () => {
    expect(html).not.toContain("fullcar.example");
    expect(html).not.toContain(TAIL);
  });
});
