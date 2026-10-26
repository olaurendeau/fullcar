import { useTranslations } from "next-intl";
import { descriptionPieces } from "@/domain/description-links";

/**
 * The organiser's description, in the header after the dates (event-description v3, « Lire »):
 * 16 px on 24, `pre-wrap`, `tab-size: 4`, wrapped anywhere, without icon or label. Its
 * `http(s)` URLs that lead where they read are links (« Les liens », 3): to a new tab, which
 * `Contact.newTab` says, without referrer, isolated from the text around them. Nothing
 * without a description. Not folded yet: #712 folds it.
 */
export function EventDescription({ description }: { description: string | null | undefined }) {
  const t = useTranslations("Contact");
  if (!description) return null;
  return (
    <p id="event-description" className="whitespace-pre-wrap wrap-anywhere [tab-size:4]">
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
            <span className="sr-only"> {t("newTab")}</span>
          </a>
        ),
      )}
    </p>
  );
}
