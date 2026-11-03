import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactFooter } from "@/components/contact/contact-footer";
import { LinkPage } from "../link-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("LinkPage.confirm"))("title") };
}

/**
 * `/connexion/confirmer#{jeton}` (organizer-account, OA5.3): the page of a confirmation link, which
 * leads to the admin of its event. As `/connexion/lien`, the same HTML for every fragment.
 */
export default function ConfirmLinkPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <LinkPage kind="confirm" />
      <ContactFooter />
    </main>
  );
}
