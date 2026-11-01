/**
 * The slot's fake Brevo (e2e/fake-brevo.mjs), set from a test through its control port, and
 * the mailbox of a test. It is set by recipient, never for all: the tests run in parallel. It
 * keeps what it is told and what it receives for as long as it runs, so each test takes an
 * address of its own (`newAddress`).
 *
 * A message holds the links of the e-mail, and so its token: a check on a message never shows
 * its text or its HTML when it fails (#365). Compare a boolean, or a count.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

/**
 * What the fake answers to a message for an address: by default (`ok`) a 201 with a message id;
 * `error`, the `status` given (500 by default, 400 to 599); `hold`, nothing until a test
 * releases it (`releaseMail`); `never`, nothing, ever, release or not.
 */
export type MailAnswer = { kind?: "ok" | "error" | "hold" | "never"; status?: number };

/** What a held message is answered when it is released: `ok` by default, or `error`. */
export type MailRelease = { kind?: "ok" | "error"; status?: number };

/** A message as the app sends it to Brevo (`POST /v3/smtp/email`), with what the fake read of it. */
export type Mail = {
  path: string;
  /** Lower case, as Node reads them; `api-key` among them. */
  headers: Record<string, string | undefined>;
  /** The JSON body, as sent. */
  body: {
    sender?: { email?: string; name?: string };
    to?: { email?: string; contactPixelTrackingConsent?: boolean }[];
    subject?: string;
    textContent?: string;
    htmlContent?: string;
    [field: string]: unknown;
  };
  subject: string;
  text: string;
  html: string;
};

function controlUrl(path: string) {
  const base = process.env.BREVO_CONTROL_URL;
  if (!base) throw new Error("e2e: BREVO_CONTROL_URL is not set");
  return new URL(path, base);
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(controlUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The addresses this worker has handed out since the last sweep. */
const issued = new Set<string>();

/** An address no other test uses, on `.test`, which no mail ever reaches. */
export function newAddress(): string {
  const address = `boite-${randomUUID()}@mailbox.test`;
  issued.add(address);
  return address;
}

/**
 * The addresses handed out by `newAddress` since the last call, and forgotten: their sends
 * are deleted after each test (fixtures.ts), so that the events created through the form
 * never fill the hour's global cap (GLOBAL_SENDS_PER_HOUR) for the tests that follow.
 */
export function takeIssuedAddresses(): string[] {
  const taken = [...issued];
  issued.clear();
  return taken;
}

/** The address field of /nouveau, whose label is `label`, filled with an address of its own: what the creation requires without a session (OA1.1). */
export async function fillAddress(page: Page, label = "Votre adresse e-mail"): Promise<string> {
  const address = newAddress();
  await page.getByLabel(label, { exact: true }).fill(address);
  return address;
}

/** From now on, the fake answers `answer` to each message for one of `addresses`, and to them only. */
export async function answerMail(addresses: string[], answer: MailAnswer): Promise<void> {
  const response = await post("/answers", { to: addresses, answer });
  if (response.status !== 204) throw new Error(`e2e: the fake Brevo refused the answer (${response.status})`);
}

/**
 * Answers every message held for one of `addresses` (`hold`), and returns how many it answered.
 * Those still to come are held too, until `answerMail` sets another answer.
 */
export async function releaseMail(addresses: string[], answer: MailRelease = {}): Promise<number> {
  const response = await post("/release", { to: addresses, answer });
  if (response.status !== 200) throw new Error(`e2e: the fake Brevo refused the release (${response.status})`);
  return ((await response.json()) as { released: number }).released;
}

/** The messages the fake received for `address`, oldest first, answered or not. */
export async function mailTo(address: string): Promise<Mail[]> {
  const url = controlUrl("/messages");
  url.searchParams.set("to", address);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`e2e: the fake Brevo did not list its messages (${response.status})`);
  const messages = (await response.json()) as Omit<Mail, "subject" | "text" | "html">[];
  return messages.map((message) => ({
    ...message,
    subject: message.body.subject ?? "",
    text: message.body.textContent ?? "",
    html: message.body.htmlContent ?? "",
  }));
}
