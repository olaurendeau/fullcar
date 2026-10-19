import { BottomSheet } from "./bottom-sheet";
import { focusName } from "./focus";
import { PhoneLink } from "./phone-link";

/**
 * The sheet of one of the device's persons, opened from their first name in « Vos
 * inscriptions »: their own number, as a `tel:` link of 44 px, when there is one (C10.1).
 * Closed, it gives the focus back to the first name. « Modifier » comes with #167.
 */
export function PersonSheet({
  person,
  open,
  onOpenChange,
}: {
  person: { id: string; firstName: string; phone: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={person.firstName}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        focusName(person.id);
      }}
    >
      {person.phone && <PhoneLink firstName={person.firstName} phone={person.phone} icon />}
    </BottomSheet>
  );
}
