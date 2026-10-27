import type { Sent } from "@/app/e/[id]/run-action";
import type { EmailError } from "@/domain/email-address";

/** The alert above « Recevoir le lien » (OA4.5): `Login.offline`, `Login.failed` or `Login.tooMany`. */
export type LoginAlert = "offline" | "failed" | "tooMany";

/** What a sign-in request shows: « Regardez vos e-mails », the field's error, or an alert. */
export type LoginOutcome = { kind: "sent" } | { kind: "invalid"; error: EmailError } | { kind: "alert"; alert: LoginAlert };

const EMAIL_ERRORS: readonly unknown[] = ["required", "invalid", "tooLong"] satisfies EmailError[];

/**
 * What `requestLink`'s answer, as sendAction gives it, shows on /connexion (OA4.2, OA4.5).
 * An answer of another shape is `failed`: never « Regardez vos e-mails » for an email
 * nothing says went out.
 */
export function loginOutcome(sent: Sent<unknown>): LoginOutcome {
  if (!sent.ok) return { kind: "alert", alert: sent.problem };
  const answer = sent.value;
  const state = typeof answer === "object" && answer !== null ? (answer as { state?: unknown }).state : undefined;
  if (state === "sent") return { kind: "sent" };
  if (state === "tooMany") return { kind: "alert", alert: "tooMany" };
  if (state === "invalid") {
    const error = (answer as { error?: unknown }).error;
    if (EMAIL_ERRORS.includes(error)) return { kind: "invalid", error: error as EmailError };
  }
  return { kind: "alert", alert: "failed" };
}
