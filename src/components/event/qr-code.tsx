import { qrPath } from "./qr-path";

/**
 * A QR code of `text`: one `<path>` of dark modules on a light ground, in the dark theme
 * too, the contrast a reader expects. The text is in no attribute and no text node; `label`
 * is what a screen reader hears. The sheet that shows it sets its size.
 */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, d } = qrPath(text);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="block h-auto w-full"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
