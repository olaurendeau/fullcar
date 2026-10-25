/**
 * The call to Brevo's transactional e-mail API (organizer-account, « Les e-mails »; #591):
 * one e-mail, to one recipient, `POST {BREVO_URL}` with the key in `api-key`. Brevo sees our
 * key, the sender, the recipient's address and the e-mail, nothing of the visitor.
 *
 * Two answers: sent (Brevo's 201, or 202), or failed (everything else, OA1.7). Each send waits
 * 10 s at most, and past them counts as failed (OA3.6): Brevo may still accept it later. Nothing
 * is thrown, and no log carries the address, the key, the URL or the e-mail: fixed words only,
 * or the HTTP status.
 */

export type Email = { to: string; subject: string; text: string; html: string };

export type SendAnswer = { state: "sent" } | { state: "failed" };

export interface Brevo {
  send(email: Email): Promise<SendAnswer>;
}

/** Brevo's `sender`: an address, and the name shown with it when `EMAIL_FROM` gives one. */
export type Sender = { email: string; name?: string };

export interface BrevoOptions {
  fetch: typeof fetch;
  /** Brevo's endpoint, `BREVO_URL`. */
  url: string;
  /** `BREVO_API_KEY`, trimmed; empty, there is no key and no call. */
  key: string;
  /** `EMAIL_FROM`, read; `null`, there is no sender and no call. */
  from: Sender | null;
}

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;

/** One address, without spaces or angle brackets: `EMAIL_FROM` is ours, not a visitor's. */
const ADDRESS = "[^\\s<>@,]+@[^\\s<>@,]+";
/** `Name <address>`, `<address>` or `address`, spaces around allowed. */
const FROM = new RegExp(`^(?:([^<>]*?)\\s*<(${ADDRESS})>|(${ADDRESS}))$`);

const SENT: SendAnswer = { state: "sent" };
const FAILED: SendAnswer = { state: "failed" };

/** `EMAIL_FROM` as Brevo's sender, or `null` when it is unset or is not one address. */
function senderOf(from: string | undefined): Sender | null {
  const read = FROM.exec((from ?? "").trim());
  if (!read) return null;
  const [, name, named, bare] = read;
  return name ? { name, email: named } : { email: named ?? bare };
}

/**
 * `BREVO_URL`, `BREVO_API_KEY` and `EMAIL_FROM`. The URL defaults to Brevo's when unset or
 * empty. The key is trimmed: pasted into Vercel with a final line break, it would fail every
 * send with a 401; blank, it is no key.
 */
export function brevoSettings(env: Record<string, string | undefined>): Omit<BrevoOptions, "fetch"> {
  return {
    url: env.BREVO_URL || BREVO_URL,
    key: (env.BREVO_API_KEY ?? "").trim(),
    from: senderOf(env.EMAIL_FROM),
  };
}

/** Why a send failed, as it is logged: a fixed word, or the HTTP status. */
type Failure = { status: number } | "timeout" | "no answer";

export function createBrevo({ fetch, url, key, from }: BrevoOptions): Brevo {
  async function call({ to, subject, text, html }: Email, sender: Sender): Promise<Failure | null> {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "api-key": key },
        // Decision: `contactPixelTrackingConsent: false` on the recipient, and nothing else about
        // tracking. — Reason: Brevo's API has no switch that turns open and click tracking off for
        // one e-mail; this field says the recipient did not consent, which anonymises both where
        // the account has per-contact consent. Tracking itself is off in the Brevo account, the
        // owner's setting (#581, decision 1), and checked by hand on a real e-mail (OA3.3).
        body: JSON.stringify({
          sender,
          to: [{ email: to, contactPixelTrackingConsent: false }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
        // Next's data cache has no business with a POST that carries an address.
        cache: "no-store",
        // A redirect would carry the key and the address to whatever host it names.
        redirect: "error",
        signal,
      });
      // The answer's body (a message id, or an error) is not read: its reading would need a
      // bound of its own, and nothing in it changes the answer.
      void response.body?.cancel().catch(() => {});
      return response.status === 201 || response.status === 202 ? null : { status: response.status };
    } catch {
      // The error is not looked at: its message or its cause may hold the URL, the address or the key.
      return signal.aborted ? "timeout" : "no answer";
    }
  }

  return {
    async send(email) {
      if (key === "") {
        console.error("email: no key");
        return FAILED;
      }
      if (from === null) {
        console.error("email: no sender");
        return FAILED;
      }
      const failure = await call(email, from);
      if (failure === null) return SENT;
      console.error(`email: send failed (${typeof failure === "string" ? failure : `HTTP ${failure.status}`})`);
      return FAILED;
    },
  };
}
