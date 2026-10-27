import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RemovalConfirmation } from "@/domain/person-removal";
import { BottomSheet } from "./bottom-sheet";
import { PersonForm, type UpdatePerson } from "./person-form";
import { PhoneLink } from "./phone-link";
import { RemovePersonButton, type RemovePerson } from "./remove-person-dialog";

/**
 * The sheet of one of the device's persons, opened from their first name in « Vos
 * inscriptions »: their own number, as a `tel:` link of 44 px, when there is one (C10.1), then
 * « Modifier », which puts the form « Modifier {prénom} » in its place (C2.3), then « Retirer de
 * l’événement » (RP1.1). Once the change is done, it closes. Closed, it gives the focus to
 * `refocus`: the first name, or, the person removed, where the removal says (RP1.5). Each opening
 * is a new sheet (`key`): it starts without the form, and the one that sent may be gone.
 */
export function PersonSheet({
  person,
  open,
  onOpenChange,
  updatePerson,
  removal,
  removePerson,
  refocus,
}: {
  person: { id: string; firstName: string; phone: string | null; drives: boolean };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updatePerson: UpdatePerson;
  removal: RemovalConfirmation;
  removePerson: RemovePerson;
  refocus: () => void;
}) {
  const t = useTranslations();
  // The first name when « Modifier » was pressed: the title stays while the sheet closes.
  const [editing, setEditing] = useState<string | null>(null);
  const isOpen = useRef(open);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing === null ? person.firstName : t("PersonForm.title.edit", { firstName: editing })}
      // « Modifier {prénom} » has fields: on a phone, it fills the screen (v4.6, rule 2).
      fullHeight={editing !== null}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        refocus();
      }}
    >
      {editing === null ? (
        <>
          {person.phone && <PhoneLink firstName={person.firstName} phone={person.phone} icon />}
          <Button variant="outline" className="h-11 w-full" onClick={() => setEditing(person.firstName)}>
            <Pencil aria-hidden />
            {t("DevicePersons.edit")}
          </Button>
          <RemovePersonButton person={person} removal={removal} removePerson={removePerson} />
        </>
      ) : (
        <PersonForm
          mode={{ kind: "edit", person, updatePerson }}
          open={() => isOpen.current}
          onDone={() => onOpenChange(false)}
        />
      )}
    </BottomSheet>
  );
}
