import { useTranslations } from "next-intl";
import { ContactFooter } from "@/components/contact/contact-footer";
import { CreateEventForm } from "@/components/event/create-event-form";

export default function Home() {
  const t = useTranslations("Home");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("tagline")}</p>
      </div>
      <CreateEventForm />
      {/* The last link of the page (#69, K1): after the form. */}
      <ContactFooter />
    </main>
  );
}
