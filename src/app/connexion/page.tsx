import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactFooter } from "@/components/contact/contact-footer";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("Login"))("title") };
}

/**
 * `/connexion` (organizer-account, OA4.1 to OA4.7): a `max-w-md` column, as `/nouveau` is.
 * The same HTML for every visitor: a session is read after the load (OA4.6).
 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <LoginForm />
      <ContactFooter />
    </main>
  );
}
