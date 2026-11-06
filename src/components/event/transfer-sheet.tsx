"use client";

import { useTranslations } from "next-intl";
import type { TransferAnswer } from "@/app/e/[id]/admin/screen-state";
import { BottomSheet } from "./bottom-sheet";
import { AddressForm } from "./fix-email-sheet";

/** Sends the address typed: what came of it, as the page takes it (`transferAnswer`). */
export type TransferTo = (typed: string) => Promise<TransferAnswer>;

/**
 * « Céder l’événement » (epic #935, OT1.2): a sheet with `Transfer.sheet.note`, an empty field with
 * the focus in it and `Transfer.email.hint` under it, then « Envoyer le lien » and « Annuler » in
 * the sheet's bar, with neither « Fermer ». « Annuler » and Escape close it and change nothing.
 * However it closes, `onClosed` places the focus (OT8.5). Each `opening` mounts a form of its own.
 */
export function TransferSheet({
  open,
  onOpenChange,
  onTransfer,
  onClosed,
  opening,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: TransferTo;
  onClosed: () => void;
  opening: number;
}) {
  const t = useTranslations("Transfer");
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("sheet.title")}
      fullHeight
      closable={false}
      onCloseAutoFocus={(focus) => {
        focus.preventDefault();
        onClosed();
      }}
    >
      <TransferForm key={opening} onTransfer={onTransfer} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

/**
 * The form, mounted with each opening: `AddressForm`, note first, with its own words. Empty,
 * "Champ requis." ; not an address, or over 254 characters, `CreateEvent.email.invalid` (OT1.3).
 * The account's own, refused by the server, `Transfer.email.self` (OT1.4). An event that no longer
 * takes a handover closes it: the page says the rest.
 */
function TransferForm({ onTransfer, onDone }: { onTransfer: TransferTo; onDone: () => void }) {
  const t = useTranslations("Transfer");
  const words = { label: t("email.label"), hint: t("email.hint"), self: t("email.self") };
  return <AddressForm initial="" send={onTransfer} note={t("sheet.note")} noteFirst words={words} onDone={onDone} />;
}
