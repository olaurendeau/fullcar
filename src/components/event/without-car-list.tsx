import { useTranslations } from "next-intl";
import type { BoardPerson } from "@/domain/board";
import type { Leg } from "@/domain/leg";

/** The leg's persons without a car, by first name, in the order they declared it (C3.4). */
export function WithoutCarList({ leg, persons }: { leg: Leg; persons: readonly BoardPerson[] }) {
  const t = useTranslations("Board");
  const headingId = `without-car-${leg}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="font-semibold">
        {t("withoutCar")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {persons.map((person) => (
          <li key={person.id} className="max-w-full rounded-full border px-3 py-1 text-sm wrap-anywhere">
            {person.firstName}
          </li>
        ))}
      </ul>
    </section>
  );
}
