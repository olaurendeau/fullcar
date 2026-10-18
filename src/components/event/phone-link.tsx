import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * A number the state carries, as a `tel:` link of 44 px (C10.1, C11.5): its text is the
 * number as typed, its name « Appeler {prénom} au {numéro} ». The link dials its digits.
 */
export function PhoneLink({
  firstName,
  phone,
  icon = false,
  className,
}: {
  firstName: string;
  phone: string;
  icon?: boolean;
  className?: string;
}) {
  const t = useTranslations("Board");

  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      aria-label={t("call", { firstName, phone })}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 self-start text-sm whitespace-nowrap underline underline-offset-3",
        className,
      )}
    >
      {icon && <Phone aria-hidden className="size-3.5 text-muted-foreground" />}
      {phone}
    </a>
  );
}
