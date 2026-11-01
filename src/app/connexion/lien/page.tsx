import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactFooter } from "@/components/contact/contact-footer";
import { LinkPage } from "../link-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("LinkPage.login"))("title") };
}

/**
 * `/connexion/lien#{jeton}` (organizer-account, OA5.1, OA5.2): the page of a sign-in link. The same
 * HTML for every visitor and for every fragment, which the server never sees: opening the page uses
 * nothing up, and the token goes to the server on the press of the button.
 */
export default function LoginLinkPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <LinkPage kind="login" />
      <ContactFooter />
    </main>
  );
}
