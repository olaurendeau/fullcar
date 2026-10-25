import { brevoSettings, createBrevo } from "@/email/brevo";
import { expect, test } from "./fixtures";
import { answerMail, mailTo, newAddress, releaseMail, type MailAnswer } from "./mailbox";

// The fake Brevo itself, as the app will reach it: `BREVO_URL`, `BREVO_API_KEY` and
// `EMAIL_FROM` of `web` (compose.yaml).
const BREVO_URL = "http://brevo:2326/v3/smtp/email";
const API_KEY = "fullcar-test-brevo-key-4d8e1b6a";
const EMAIL_FROM = "Fullcar <bonjour@fullcar.test>";

/** A message as Brevo's API takes it, to `to`. */
function messageTo(to: string, fields: Record<string, unknown> = {}) {
  return {
    sender: { name: "Fullcar", email: "bonjour@fullcar.test" },
    to: [{ email: to }],
    subject: "Sujet",
    textContent: "Texte",
    htmlContent: "<p>Texte</p>",
    ...fields,
  };
}

function sendRaw(body: string, headers: Record<string, string> = { "api-key": API_KEY }, url = BREVO_URL, signal?: AbortSignal) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body, signal });
}

function send(to: string, signal?: AbortSignal) {
  return sendRaw(JSON.stringify(messageTo(to)), undefined, undefined, signal);
}

/** A control request as sent, to see the fake refuse what `answerMail` would not send. */
function setRaw(path: string, body: string) {
  return fetch(new URL(path, process.env.BREVO_CONTROL_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

/** The client of `src/email/brevo.ts`, set as `web` is, and every line it writes to the console. */
function client() {
  const logs: unknown[][] = [];
  const brevo = createBrevo({ fetch, ...brevoSettings({ BREVO_URL, BREVO_API_KEY: API_KEY, EMAIL_FROM }) });
  return {
    logs,
    async send(to: string) {
      const error = console.error;
      console.error = (...args: unknown[]) => void logs.push(args);
      try {
        return await brevo.send({ to, subject: "Sujet", text: "Texte", html: "<p>Texte</p>" });
      } finally {
        console.error = error;
      }
    },
  };
}

test.describe("the fake Brevo", () => {
  test("answers a 201 with a message id to a message for an address nobody set", async () => {
    const response = await send(newAddress());
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(typeof (await response.json()).messageId).toBe("string");
  });

  test("records each message for its recipient: its path, its headers and its body as sent", async () => {
    const address = newAddress();
    expect((await mailTo(address)).length).toBe(0);

    await sendRaw(JSON.stringify(messageTo(address, { subject: "Premier" })), { "api-key": API_KEY, "X-Second": "no" });
    await sendRaw(JSON.stringify(messageTo(address, { subject: "Second" })));
    await send(newAddress());

    const mails = await mailTo(address);
    expect(mails.length).toBe(2);
    const [first, second] = mails;
    expect(first.path).toBe("/v3/smtp/email");
    expect(first.headers["api-key"]).toBe(API_KEY);
    expect(first.headers["content-type"]).toBe("application/json");
    expect(first.headers["x-second"]).toBe("no");
    expect(first.body).toEqual(messageTo(address, { subject: "Premier" }));
    expect([first.subject, first.text, first.html]).toEqual(["Premier", "Texte", "<p>Texte</p>"]);
    expect(second.subject).toBe("Second");
    // An address is one address, in any case.
    expect((await mailTo(address.toUpperCase())).length).toBe(2);
  });

  for (const status of [400, 401, 402, 429, 500, 503]) {
    test(`answers error ${status} to the address it is set for, and to it only`, async () => {
      const address = newAddress();
      await answerMail([address], { kind: "error", status });
      const response = await send(address);
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain(API_KEY);
      expect((await send(newAddress())).status).toBe(201);
    });
  }

  test("answers error 500 when no status is given", async () => {
    const address = newAddress();
    await answerMail([address], { kind: "error" });
    expect((await send(address)).status).toBe(500);
  });

  test("answers each of the addresses given in one setting, and ok again once set back", async () => {
    const addresses = [newAddress(), newAddress()];
    await answerMail(addresses, { kind: "error", status: 503 });
    for (const address of addresses) expect((await send(address)).status).toBe(503);
    await answerMail(addresses, { kind: "ok" });
    for (const address of addresses) expect((await send(address)).status).toBe(201);
  });

  test("holds a message until it is released, recorded while it waits", async () => {
    const address = newAddress();
    await answerMail([address], { kind: "hold" });
    let answered = false;
    const pending = send(address).finally(() => (answered = true));
    await expect.poll(async () => (await mailTo(address)).length, { timeout: 1000 }).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(answered).toBe(false);
    // Releasing another address answers nothing here.
    expect(await releaseMail([newAddress()])).toBe(0);
    expect(answered).toBe(false);

    expect(await releaseMail([address])).toBe(1);
    expect((await pending).status).toBe(201);
    // Nothing is left to release.
    expect(await releaseMail([address])).toBe(0);
  });

  test("answers a held message with the error it is released with", async () => {
    const address = newAddress();
    await answerMail([address], { kind: "hold" });
    const pending = [send(address), send(address)];
    await expect.poll(async () => (await mailTo(address)).length, { timeout: 1000 }).toBe(2);
    expect(await releaseMail([address], { kind: "error", status: 502 })).toBe(2);
    for (const response of await Promise.all(pending)) expect(response.status).toBe(502);
  });

  test("never answers a message set to never, released or not", async () => {
    const address = newAddress();
    await answerMail([address], { kind: "never" });
    const started = Date.now();
    const pending = send(address, AbortSignal.timeout(2_000));
    await expect.poll(async () => (await mailTo(address)).length, { timeout: 1000 }).toBe(1);
    expect(await releaseMail([address])).toBe(0);
    await expect(pending).rejects.toThrow();
    expect(Date.now() - started).toBeGreaterThanOrEqual(2_000);
  });

  test("answers 401 to a message without api-key, whatever the address is set to, and records it", async () => {
    const address = newAddress();
    await answerMail([address], { kind: "never" });
    for (const headers of [{}, { "api-key": "" }] as Record<string, string>[]) {
      const started = Date.now();
      const response = await sendRaw(JSON.stringify(messageTo(address)), headers);
      expect(response.status).toBe(401);
      expect(Date.now() - started).toBeLessThan(1000);
    }
    expect((await mailTo(address)).length).toBe(2);
  });

  test("answers 400 to a message it cannot read, and records none of them", async () => {
    const address = newAddress();
    const unreadable: [string, string][] = [
      ["not JSON", "not json"],
      ["no sender", JSON.stringify(messageTo(address, { sender: undefined }))],
      ["a sender without address", JSON.stringify(messageTo(address, { sender: { name: "Fullcar" } }))],
      ["no recipient", JSON.stringify(messageTo(address, { to: [] }))],
      ["a recipient without address", JSON.stringify(messageTo(address, { to: [{ name: "A" }] }))],
      ["no subject", JSON.stringify(messageTo(address, { subject: "" }))],
      ["no content", JSON.stringify(messageTo(address, { textContent: undefined, htmlContent: undefined }))],
    ];
    for (const [label, body] of unreadable) {
      const response = await sendRaw(body);
      expect(response.status, label).toBe(400);
      expect(await response.text(), label).not.toContain(API_KEY);
    }
    expect((await sendRaw(JSON.stringify(messageTo(address)), undefined, "http://brevo:2326/v3/smtp/emails")).status).toBe(404);
    expect((await fetch(BREVO_URL)).status).toBe(404);
    expect((await mailTo(address)).length).toBe(0);
  });

  test("refuses a malformed setting or release", async () => {
    const address = newAddress();
    const malformed: unknown[] = [
      { to: [], answer: { kind: "error" } },
      { to: address, answer: { kind: "error" } },
      { to: ["not an address"], answer: { kind: "error" } },
      { to: [address], answer: { kind: "bounce" } },
      { to: [address], answer: { kind: "error", status: 200 } },
      { to: [address], answer: { kind: "error", status: 600 } },
      { to: [address], answer: { kind: "error", status: "500" } },
      { to: [address], answer: { kind: "hold", status: 500 } },
      { to: [address] },
    ];
    for (const body of malformed) {
      expect((await setRaw("/answers", JSON.stringify(body))).status, JSON.stringify(body)).toBe(400);
    }
    expect((await setRaw("/answers", "not json")).status).toBe(400);
    for (const body of [{ to: [address], answer: { kind: "hold" } }, { to: [] }, { to: [address], answer: { status: 99 } }]) {
      expect((await setRaw("/release", JSON.stringify(body))).status, JSON.stringify(body)).toBe(400);
    }
    await expect(answerMail([address], { kind: "unknown" as MailAnswer["kind"] })).rejects.toThrow("(400)");
    // Nothing was set by a refused setting.
    expect((await send(address)).status).toBe(201);
  });
});

test.describe("the client of src/email/brevo.ts against the fake Brevo", () => {
  test("sends: the fake records the key, the sender, the recipient without tracking consent", async () => {
    const address = newAddress();
    const brevo = client();
    expect(await brevo.send(address)).toEqual({ state: "sent" });
    const [mail] = await mailTo(address);
    expect(mail.headers["api-key"]).toBe(API_KEY);
    expect(mail.body.sender).toEqual({ name: "Fullcar", email: "bonjour@fullcar.test" });
    expect(mail.body.to).toEqual([{ email: address, contactPixelTrackingConsent: false }]);
    expect(brevo.logs).toEqual([]);
  });

  test("counts an error of Brevo as a failure, logged without the address", async () => {
    const address = newAddress();
    await answerMail([address], { kind: "error", status: 503 });
    const brevo = client();
    expect(await brevo.send(address)).toEqual({ state: "failed" });
    expect(brevo.logs).toEqual([["email: send failed (HTTP 503)"]]);
  });

  test("waits 10 s at most for Brevo that does not answer, then counts it as a failure (OA3.6)", async () => {
    test.setTimeout(30_000);
    const address = newAddress();
    await answerMail([address], { kind: "never" });
    const brevo = client();
    const started = Date.now();
    expect(await brevo.send(address)).toEqual({ state: "failed" });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(10_000);
    expect(elapsed).toBeLessThan(11_000);
    expect((await mailTo(address)).length).toBe(1);
    expect(brevo.logs).toEqual([["email: send failed (timeout)"]]);
    expect(JSON.stringify(brevo.logs).includes(address.split("@")[0])).toBe(false);
  });

  test("waits for a held message, then takes its answer", async () => {
    const address = newAddress();
    await answerMail([address], { kind: "hold" });
    const brevo = client();
    const pending = brevo.send(address);
    await expect.poll(async () => (await mailTo(address)).length, { timeout: 1000 }).toBe(1);
    expect(await releaseMail([address])).toBe(1);
    expect(await pending).toEqual({ state: "sent" });
  });
});
