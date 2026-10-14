import { useTranslations } from "next-intl";
import { ContactFooter } from "@/components/contact/contact-footer";

export default function Home() {
  const t = useTranslations("Home");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-2 p-4">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("tagline")}</p>
      <ContactFooter />
    </main>
  );
}
