import { SearchX } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/brand/brand-mark";
import { ContactFooter } from "@/components/contact/contact-footer";
import { Button } from "@/components/ui/button";

/**
 * One page for an unknown, a malformed id, or (later) an event deleted 30 days after its date: nothing tells them apart
 * (#3, C6.1 to C6.3).
 */
export default function EventNotFound() {
  const t = useTranslations("EventNotFound");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-6">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-brand-soft text-primary">
        <SearchX className="size-6" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <BrandMark className="mt-0.5 size-7" />
          <h1 className="min-w-0 text-2xl font-bold">{t("title")}</h1>
        </div>
        <p className="text-muted-foreground">{t("checkLink")}</p>
        <p className="text-muted-foreground">{t("deleted")}</p>
      </div>
      <Button asChild className="mt-6 h-11">
        <Link href="/nouveau">{t("create")}</Link>
      </Button>
      <ContactFooter />
    </main>
  );
}
