import Link from "next/link";
import { useTranslations } from "next-intl";
import { ContactFooter } from "@/components/contact/contact-footer";
import { Button } from "@/components/ui/button";

/** The three steps of « Comment ça marche », in their order. */
const STEPS = ["create", "share", "follow"] as const;

/**
 * `/`: what Fullcar does, and one link to the creation form at `/nouveau` (#232, A1).
 * No field here: the form is `/nouveau`'s.
 */
export default function Home() {
  const t = useTranslations("Home");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("tagline")}</p>
      </div>
      <p>{t("intro")}</p>
      <Button asChild className="h-11">
        <Link href="/nouveau">{t("create")}</Link>
      </Button>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("howItWorks")}</h2>
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, index) => (
            <li key={step} className="grid grid-cols-[1.75rem_1fr] gap-x-3 gap-y-0.5">
              {/* The list already numbers its items for a screen reader. */}
              <span
                aria-hidden="true"
                className="row-span-2 grid size-7 place-items-center rounded-full bg-muted text-sm font-semibold"
              >
                {index + 1}
              </span>
              <h3 className="font-semibold leading-7">{t(`steps.${step}.title`)}</h3>
              <p className="text-muted-foreground">{t(`steps.${step}.text`)}</p>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-muted-foreground">{t("deleted")}</p>
      {/* The last link of the page (#69, K1): after the steps. */}
      <ContactFooter />
    </main>
  );
}
