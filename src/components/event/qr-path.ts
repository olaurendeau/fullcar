import { encode } from "uqr";

/**
 * Blank modules around the code, the margin a QR reader expects. It is all of it: `uqr` is
 * asked for `border: 0`, its own 1-module border would make the margin 5.
 */
const QUIET_ZONE = 4;

/**
 * The dark modules of the QR code of `text` (error correction M) as one SVG path, quiet
 * zone included; `size` is the side of the square viewBox, in modules. Only the matrix of
 * `uqr` is used: the SVG is ours, and the text is in no attribute and no text node (LP8.1).
 */
export function qrPath(text: string): { size: number; d: string } {
  const { data } = encode(text, { ecc: "M", border: 0 });
  let d = "";
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    });
  });
  return { size: data.length + 2 * QUIET_ZONE, d };
}
