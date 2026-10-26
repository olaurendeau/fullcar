import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from "react";
import { Button } from "@/components/ui/button";
import { guessFolds } from "@/domain/description";
import { descriptionPieces } from "@/domain/description-links";
import { focusTitle } from "./focus";

/** Lines shown while folded (event-description v3, « Lire »). */
const FOLDED_LINES = 4;

/**
 * Without JavaScript, nothing could unfold the text: shown whole, without the button. From a
 * `<noscript>`, not a `scripting` media query, which Safari lacks before 17 (DS2.11).
 */
const WITHOUT_SCRIPT =
  "#event-description{display:block;overflow:visible;-webkit-line-clamp:none;line-clamp:none}#event-description-toggle{display:none}";

/**
 * Room for a link's focus ring, drawn 4 px outside it, which the fold's `overflow: hidden` would
 * cut (DS3.6): padding, cancelled by as much negative margin, so that the text does not move.
 * 6 px on the sides and at the top, where nothing overflows. At the bottom, 4 px when the text
 * holds in 4 lines; only 2 px when it folds, as more would show the top of the 5th line. The ring
 * is drawn around the link's glyphs, not its line: the 2 px of half-leading of a 24 px line of
 * 16 px text leave it 2 px past the line, which those 2 px hold, its antialiased edge aside.
 */
const RING_ROOM = "-mx-1.5 px-1.5 -mt-1.5 pt-1.5";
const RING_ROOM_BOTTOM = { holds: "-mb-1 pb-1", folds: "-mb-0.5 pb-0.5" };

/**
 * Whether the text takes more than 4 lines: folded, its whole height beyond the one shown;
 * unfolded, beyond 4 of its lines, whatever the text's size, its padding aside.
 */
function overflows(text: HTMLElement, folded: boolean): boolean {
  if (folded) return text.scrollHeight > text.clientHeight + 1;
  const { lineHeight, paddingTop, paddingBottom } = getComputedStyle(text);
  const content = text.scrollHeight - parseFloat(paddingTop) - parseFloat(paddingBottom);
  return content > FOLDED_LINES * parseFloat(lineHeight) + 1;
}

/**
 * The organiser's description, in the header after the dates (event-description v3, « Lire »):
 * 16 px on 24, `pre-wrap`, `tab-size: 4`, wrapped anywhere, without icon or label. Its
 * `http(s)` URLs that lead where they read are links (« Les liens », 3): to a new tab, which
 * `Contact.newTab` says, without referrer, isolated from the text around them. Nothing
 * without a description.
 */
export function EventDescription({ description }: { description: string | null | undefined }) {
  if (!description) return null;
  return <FoldedDescription description={description} />;
}

/**
 * Folded beyond 4 lines, then « Afficher toute la description » (DS2.4–DS2.13). The text is
 * folded by CSS whenever it is not unfolded, from the server's HTML on: it never moves. The
 * server renders the button when it guesses the text is long; the browser measures and corrects
 * the button alone, once more on each resize, font load and change of the text. Folded on each
 * load, unfolded in this component's memory only, and folded again when the button goes: a long
 * text that comes back comes folded. The button keeps the focus; one that goes with the focus
 * sends it to the title. A link hidden by the fold that takes the focus unfolds the text (DS3.7).
 */
function FoldedDescription({ description }: { description: string }) {
  const t = useTranslations("Event.description");
  const contact = useTranslations("Contact");
  const textRef = useRef<HTMLParagraphElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [folds, setFolds] = useState(() => guessFolds(description));
  const [expanded, setExpanded] = useState(false);
  /** What to bring into view once the text has its new height: the button folded, or a link unfolded. */
  const reveal = useRef<"button" | "focus" | null>(null);
  const folded = !expanded;

  const measure = useCallback(() => {
    const text = textRef.current;
    if (!text) return;
    const next = overflows(text, text.dataset.folded === "true");
    if (!next) {
      if (buttonRef.current !== null && document.activeElement === buttonRef.current) focusTitle();
      setExpanded(false);
    }
    setFolds(next);
  }, []);

  // Each change of the text: 6 lines replaced by 5 keep the same folded height, which no resize would tell.
  useLayoutEffect(measure, [description, measure]);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    const target = reveal.current === "button" ? buttonRef.current : reveal.current === "focus" ? document.activeElement : null;
    reveal.current = null;
    target?.scrollIntoView({ block: "nearest" });
  }, [expanded]);

  function unfoldForHidden(event: FocusEvent<HTMLParagraphElement>) {
    const text = event.currentTarget;
    const rects = event.target.getClientRects();
    const last = rects[rects.length - 1];
    if (!folds || !folded || event.target === text || !last) return;
    // From the text's own top, whatever the browser scrolled it by to show what has the focus.
    if (last.bottom - text.getBoundingClientRect().top + text.scrollTop <= text.clientHeight + 1) return;
    text.scrollTop = 0;
    reveal.current = "focus";
    setExpanded(true);
  }

  return (
    <div className="flex flex-col">
      <p
        ref={textRef}
        id="event-description"
        data-folded={folded}
        onFocus={unfoldForHidden}
        className={`${RING_ROOM} ${RING_ROOM_BOTTOM[folds ? "folds" : "holds"]} whitespace-pre-wrap wrap-anywhere [tab-size:4]${folded ? " line-clamp-4" : ""}`}
      >
        {descriptionPieces(description).map((piece, index) =>
          piece.kind === "text" ? (
            piece.text
          ) : (
            <a
              key={index}
              href={piece.href}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              dir="ltr"
              className="rounded-sm underline underline-offset-4 [unicode-bidi:isolate] focus-visible:focus-ring"
            >
              {piece.href}
              <span className="sr-only"> {contact("newTab")}</span>
            </a>
          ),
        )}
      </p>
      {folds && (
        <Button
          ref={buttonRef}
          id="event-description-toggle"
          type="button"
          variant="outline"
          className="mt-2 h-11 w-full"
          aria-expanded={expanded}
          aria-controls="event-description"
          onClick={(event) => {
            // Safari does not focus a button it clicks.
            event.currentTarget.focus();
            if (textRef.current) textRef.current.scrollTop = 0;
            reveal.current = expanded ? "button" : null;
            setExpanded(!expanded);
          }}
        >
          {expanded ? t("less") : t("more")}
        </Button>
      )}
      <noscript>
        <style>{WITHOUT_SCRIPT}</style>
      </noscript>
    </div>
  );
}
