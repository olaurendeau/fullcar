import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactFooter } from "@/components/contact/contact-footer";
import { MyEventsScreen } from "./my-events-screen";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("MyEvents"))("title") };
}

/**
 * `/mes-evenements` (organizer-account, OA6.1 to OA6.9): a `max-w-md` column, as the home
 * page is. The same HTML for every visitor: the events are read after the load, with the
 * session's token in the body of `myEvents` (#606).
 */
export default function MyEventsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <MyEventsScreen />
      <ContactFooter />
    </main>
  );
}
