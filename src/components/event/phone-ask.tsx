import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Leg } from "@/domain/leg";
import type { PhoneAsk } from "@/domain/phone-ask";
import { BottomSheet } from "./bottom-sheet";
import { focusCarTitle } from "./focus";
import { PersonForm, type UpdatePerson } from "./person-form";

/** The person the button opens « Modifier {prénom} » for, as `personOf` gives her. */
export interface AskedPerson {
  id: string;
  firstName: string;
  phone: string | null;
  drives: boolean;
}

/**
 * What a car's card asks the device (event-board v4.8, rules 1 and 2): its sentence, then
 * « Ajouter un numéro », 44 px, named for `person` and described by the sentence. Its appearance is
 * not announced (v4.8-6). The button opens « Modifier {prénom} » directly, full height, the focus in
 * the number. Saved with a number, the sentence goes with the button, and the focus goes to the
 * car's title; closed without one, the sentence stays, and the focus comes back to the button.
 * The sheet outlives the sentence: it closes as any sheet does once its change is done.
 */
export function PhoneAskButton({
  ask,
  person,
  leg,
  rideId,
  updatePerson,
}: {
  /** Null when the card asks nothing. */
  ask: PhoneAsk | null;
  person: AskedPerson | null;
  leg: Leg;
  rideId: string;
  updatePerson: UpdatePerson;
}) {
  const t = useTranslations();
  const sentenceId = `${useId()}-why`;
  const button = useRef<HTMLButtonElement>(null);
  // `opened` counts the openings: each one is a new form. The person is the one asked as it opened.
  const [sheet, setSheet] = useState<{ person: AskedPerson; open: boolean; opened: number } | null>(null);
  const isOpen = useRef(false);
  const toggle = (open: boolean) => {
    isOpen.current = open;
    setSheet((current) => current && { ...current, open });
  };

  return (
    <>
      {ask && person && (
        <div className="flex flex-col items-start gap-2">
          <p id={sentenceId} className="text-[13px] leading-[18px] text-muted-foreground wrap-anywhere">
            {ask.kind === "driver" ? t("Board.car.addPhoneWhy.driver") : t("Board.car.addPhoneWhy.passenger", { driver: ask.driver })}
          </p>
          <Button
            ref={button}
            variant="outline"
            aria-label={t("Board.car.addPhoneLabel", { firstName: ask.firstName })}
            aria-describedby={sentenceId}
            className="h-11"
            onClick={() => {
              isOpen.current = true;
              setSheet((current) => ({ person, open: true, opened: (current?.opened ?? 0) + 1 }));
            }}
          >
            <Phone aria-hidden />
            {t("Board.car.addPhone")}
          </Button>
        </div>
      )}
      {sheet && (
        <BottomSheet
          open={sheet.open}
          onOpenChange={toggle}
          title={t("PersonForm.title.edit", { firstName: sheet.person.firstName })}
          // It has fields: on a phone, it fills the screen (v4.6, rule 2).
          fullHeight
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const back = button.current;
            if (back?.isConnected) back.focus();
            else focusCarTitle(leg, rideId);
          }}
        >
          <PersonForm
            key={sheet.opened}
            mode={{ kind: "edit", person: sheet.person, updatePerson }}
            open={() => isOpen.current}
            onDone={() => toggle(false)}
            focus="phone"
          />
        </BottomSheet>
      )}
    </>
  );
}
