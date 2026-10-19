import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Leg } from "@/domain/leg";
import { focusCell } from "./focus";
import { HidesPage, useSends, type FromSheet } from "./hidden-page";
import type { BarProblem } from "./message-bar";

/**
 * Removes one of the device's cars (`removeRide`, C8.6): `null` once done, the problem to show
 * otherwise, `undefined` when it is on its way already. `removed` is called as soon as the car
 * is known to be gone, before the page takes the state without it. A problem the confirmation
 * no longer shows goes to the bar.
 */
export type RemoveRide = (
  removal: { rideId: string; leg: Leg; sending: (sending: boolean) => void; removed: () => void },
  confirmation: FromSheet,
) => Promise<BarProblem | null | undefined>;

interface Car {
  id: string;
  leg: Leg;
  driverId: string;
  passengers: number;
}

/**
 * « Retirer la voiture » on a car of the device (C8.1), and its confirmation (C8.6). The
 * removal stays inactive, on each opening, until its answer. Removed, the car goes with this
 * button: the focus goes to the driver's cell for that leg, or to the folded section's button.
 */
export function RemoveRideButton({ car, removeRide }: { car: Car; removeRide: RemoveRide }) {
  const t = useTranslations("Board.car");
  const [open, setOpen] = useState(false);
  // Each opening is a new confirmation, even one reopened while it closes.
  const [opened, setOpened] = useState(0);
  const [sending, setSending] = useState(false);
  const isOpen = useRef(false);
  const removed = useRef(false);
  const { driverId, leg } = car;

  const toggle = (next: boolean) => {
    if (next) setOpened((count) => count + 1);
    isOpen.current = next;
    setOpen(next);
  };

  // The car gone, this button and its confirmation go too, open or not: if the focus was in
  // either, it is on nothing now, and the driver's cell takes it. Radix's own return to this
  // button, which no longer exists, then does nothing.
  useEffect(
    () => () => {
      const active = document.activeElement;
      if (removed.current && (active === null || active === document.body)) focusCell(driverId, leg);
    },
    [driverId, leg],
  );

  return (
    <AlertDialog open={open} onOpenChange={toggle}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="h-11 flex-1 text-destructive hover:text-destructive aria-expanded:text-destructive"
        >
          <Trash2 aria-hidden />
          {t("remove")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <HidesPage />
        <Confirmation
          key={opened}
          car={car}
          isOpen={() => isOpen.current}
          sending={sending}
          send={(confirmation) =>
            removeRide(
              { rideId: car.id, leg, sending: setSending, removed: () => (removed.current = true) },
              confirmation,
            )
          }
          close={() => toggle(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The confirmation's content, one per opening: how many persons will be without a car, that
 * nobody is notified, then the confirmation in red, and « Annuler », which changes nothing
 * (C8.7). Confirmed, it stays open, its button inactive, until the answer: a failure is said
 * there while it is open, the one that sent; in the bar otherwise, once nothing hides the page.
 */
function Confirmation({
  car,
  isOpen,
  sending,
  send,
  close,
}: {
  car: Car;
  isOpen: () => boolean;
  sending: boolean;
  send: (confirmation: FromSheet) => Promise<BarProblem | null | undefined>;
  close: () => void;
}) {
  const t = useTranslations();
  const [problem, setProblem] = useState<BarProblem | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const sends = useSends(isOpen, `ride:${car.id}`);

  // The confirmation button lost the focus while it was inactive: after a failure, it gets it back.
  useEffect(() => {
    if (problem && !sending && document.activeElement === document.body) confirmButton.current?.focus();
  }, [problem, sending]);

  async function confirm() {
    setProblem(null);
    const confirmation = sends();
    const outcome = await send(confirmation);
    if (outcome === undefined || !confirmation.inSheet()) return;
    if (outcome === null) close();
    else setProblem(outcome);
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("RideChanges.remove.title")}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-1.5">
            <p>{t("RideChanges.remove.body", { passengers: car.passengers })}</p>
            <p>{t("RideChanges.remove.notified")}</p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {t(`Actions.${problem}`)}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <AlertDialogPrimitive.Action asChild>
          <Button
            ref={confirmButton}
            disabled={sending}
            className="h-11 w-full bg-destructive text-white hover:bg-destructive/90"
            onClick={(event) => {
              // Closed by the answer, not by the press.
              event.preventDefault();
              void confirm();
            }}
          >
            {t("Board.car.remove")}
          </Button>
        </AlertDialogPrimitive.Action>
        <AlertDialogCancel className="h-11 w-full">{t("Actions.cancel")}</AlertDialogCancel>
      </div>
    </>
  );
}
