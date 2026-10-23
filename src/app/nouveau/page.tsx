import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ContactFooter } from "@/components/contact/contact-footer";
import { CreateEventForm } from "@/components/event/create-event-form";
import { publicPageMetadata } from "../site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("NewEvent"))("title"), ...publicPageMetadata("/nouveau") };
}

/** `/nouveau`: the creation form, under its own title (#232, A2.1). */
export default function NewEventPage() {
  const t = useTranslations("NewEvent");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <CreateEventForm />
      {/* The last link of the page (#69, K1): after the form. */}
      <ContactFooter />
    </main>
  );
}
