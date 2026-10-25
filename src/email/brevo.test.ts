import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brevoSettings, createBrevo, type Email, type SendAnswer } from "./brevo";

const BREVO = "https://api.brevo.com/v3/smtp/email";
/** A key nothing else in a log could be mistaken for. */
const KEY = "fullcar-test-brevo-key-4d8e1b6a";
const ADDRESS = "zorglub.destinataire@example.org";
const EMAIL: Email = {
  to: ADDRESS,
  subject: "Confirmez votre adresse pour Fullcar",
  text: "Bonjour,\n\nhttps://fullcar.test/connexion/confirmer#abc",
  html: '<p>Bonjour,</p><p><a href="https://fullcar.test/connexion/confirmer#abc">Confirmer</a></p>',
};

const SENT: SendAnswer = { state: "sent" };
const FAILED: SendAnswer = { state: "failed" };

type Answer = (url: string, init: RequestInit) => Response | Promise<Response>;
type Env = Record<string, string | undefined>;

const created = () => new Response(JSON.stringify({ messageId: "<202610251200.1@smtp-relay.mailin.fr>" }), { status: 201 });
/** A refusal that repeats what it was sent, as an error page could. */
const status = (code: number) => new Response(`${KEY} ${ADDRESS}: refused`, { status: code });

/**
 * Brevo behind an injected `fetch`, its settings read from `env` as the server would read them
 * (with the test key and a sender unless `env` says otherwise): `answers` in turn, then a 201.
 */
function setup(answers: Answer[] = [], env: Env = {}) {
  const fetch = vi.fn((url: string, init: RequestInit) => Promise.resolve((answers.shift() ?? created)(url, init)));
  const brevo = createBrevo({
    fetch: fetch as unknown as typeof globalThis.fetch,
    ...brevoSettings({ BREVO_API_KEY: KEY, EMAIL_FROM: "Fullcar <bonjour@fullcar.test>", ...env }),
  });
  return { send: (email: Email = EMAIL) => brevo.send(email), fetch };
}

/** Every line written to the console, by any of its methods. */
let logs: unknown[][];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("the request", () => {
  it("is a POST of JSON to BREVO_URL, with the key in api-key", async () => {
    const { send, fetch } = setup([], { BREVO_URL: "http://brevo:2326/v3/smtp/email" });
    await send();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://brevo:2326/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect([...new Headers(init.headers).entries()]).toEqual([
      ["accept", "application/json"],
      ["api-key", KEY],
      ["content-type", "application/json"],
    ]);
  });

  it("sends the sender, the one recipient, the subject, the text and the HTML, and nothing else", async () => {
    const { send, fetch } = setup();
    await send();
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
      sender: { name: "Fullcar", email: "bonjour@fullcar.test" },
      to: [{ email: ADDRESS, contactPixelTrackingConsent: false }],
      subject: EMAIL.subject,
      textContent: EMAIL.text,
      htmlContent: EMAIL.html,
    });
  });

  it("asks for no tracking of the recipient (OA3.3): no consent, no tag, no parameter", async () => {
    const { send, fetch } = setup();
    await send();
    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(body.to[0].contactPixelTrackingConsent).toBe(false);
    for (const field of ["tags", "params", "headers", "templateId", "messageVersions", "cc", "bcc", "replyTo"]) {
      expect(body, field).not.toHaveProperty(field);
    }
  });

  it("is kept out of Next's data cache, and follows no redirect", async () => {
    const { send, fetch } = setup();
    await send();
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
  });
});

describe("Brevo's answer", () => {
  it.each([201, 202])("a %i is sent, and logs nothing", async (code) => {
    expect(await setup([() => new Response(null, { status: code })]).send()).toEqual(SENT);
    expect(logs).toEqual([]);
  });

  it.each([400, 401, 402, 403, 429, 500, 503])("a %i is a failure, logged as its status", async (code) => {
    expect(await setup([() => status(code)]).send()).toEqual(FAILED);
    expect(logs).toEqual([[`email: send failed (HTTP ${code})`]]);
  });

  it("a 200 that is not Brevo's 201 or 202 is a failure too", async () => {
    expect(await setup([() => new Response("<html>portal</html>", { status: 200 })]).send()).toEqual(FAILED);
    expect(logs).toEqual([["email: send failed (HTTP 200)"]]);
  });

  it("no answer is a failure, never thrown", async () => {
    const { send } = setup([() => Promise.reject(new TypeError("fetch failed"))]);
    expect(await send()).toEqual(FAILED);
    expect(logs).toEqual([["email: send failed (no answer)"]]);
  });

  it("a fetch that throws before it starts is a failure, never thrown", async () => {
    const { send } = setup([
      () => {
        throw new TypeError("Invalid URL");
      },
    ]);
    expect(await send()).toEqual(FAILED);
    expect(logs).toEqual([["email: send failed (no answer)"]]);
  });
});

describe("the bound of 10 s (OA3.6)", () => {
  /** Brevo that never answers: the call ends only when its signal aborts, as a real fetch does. */
  const never: Answer = (_, init) =>
    new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));

  it("gives each send its own AbortSignal.timeout(10_000)", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { send, fetch } = setup();
    await send();
    await send();
    expect(timeout.mock.calls).toEqual([[10_000], [10_000]]);
    expect(fetch.mock.calls[0][1].signal).toBe(timeout.mock.results[0].value);
    expect(fetch.mock.calls[1][1].signal).toBe(timeout.mock.results[1].value);
  });

  it("counts Brevo that does not answer within the 10 s as a failure, logged as timeout", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let settled = false;
    const pending = setup([never])
      .send()
      .finally(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect(await pending).toEqual(FAILED);
    expect(logs).toEqual([["email: send failed (timeout)"]]);
  });

  it("does not read the body of the answer, which would not count in the 10 s otherwise", async () => {
    let pulled = false;
    const body = new ReadableStream({ pull: () => void (pulled = true) }, { highWaterMark: 0 });
    expect(await setup([() => new Response(body, { status: 201 })]).send()).toEqual(SENT);
    expect(pulled).toBe(false);
  });
});

describe("without a key or a sender", () => {
  it.each([
    ["unset", { BREVO_API_KEY: undefined }],
    ["empty", { BREVO_API_KEY: "" }],
    ["blank", { BREVO_API_KEY: " \t\r\n " }],
  ])("fails without a call when the key is %s, and logs only « email: no key »", async (_, env) => {
    const { send, fetch } = setup([], env);
    expect(await send()).toEqual(FAILED);
    expect(fetch).not.toHaveBeenCalled();
    expect(logs).toEqual([["email: no key"]]);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["not an address", "Fullcar"],
    ["two addresses", "a@fullcar.test, b@fullcar.test"],
    ["an unclosed name", "Fullcar <bonjour@fullcar.test"],
  ])("fails without a call when EMAIL_FROM is %s, and logs only « email: no sender »", async (_, from) => {
    const { send, fetch } = setup([], { EMAIL_FROM: from });
    expect(await send()).toEqual(FAILED);
    expect(fetch).not.toHaveBeenCalled();
    expect(logs).toEqual([["email: no sender"]]);
  });
});

describe("what a send leaves in the logs", () => {
  /** Nothing that names the recipient, the key or the endpoint. */
  const LEAK = /zorglub|destinataire|example\.org|fullcar-test-brevo-key|4d8e1b6a|brevo:2326|api\.brevo\.com|@/i;
  const withAddress = () =>
    Promise.reject(new TypeError(`fetch failed for ${ADDRESS} with ${KEY}`, { cause: new Error(`${BREVO} ${ADDRESS}`) }));

  it.each([
    ["a 201", [created]],
    ["a 400 that repeats the address and the key", [() => status(400)]],
    ["a 401", [() => status(401)]],
    ["a 500", [() => status(500)]],
    ["a network error that carries the address and the key", [withAddress]],
  ] as [string, Answer[]][])("logs %s in fixed words, never the address, the key nor the URL", async (_, answers) => {
    await setup(answers, { BREVO_URL: "http://brevo:2326/v3/smtp/email" }).send();
    expect(LEAK.test(JSON.stringify(logs))).toBe(false);
  });

  it("logs a timeout without the address", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const pending = setup([(_, init) => new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(new Error(ADDRESS))))]).send();
    controller.abort();
    await pending;
    expect(logs).toEqual([["email: send failed (timeout)"]]);
  });

  it("logs a missing key or sender without the address", async () => {
    await setup([], { BREVO_API_KEY: "" }).send();
    await setup([], { EMAIL_FROM: ADDRESS.replace("@", "") }).send();
    expect(logs).toEqual([["email: no key"], ["email: no sender"]]);
  });
});

describe("brevoSettings", () => {
  it("defaults to Brevo's endpoint, no key and no sender", () => {
    const defaults = { url: BREVO, key: "", from: null };
    expect(brevoSettings({})).toEqual(defaults);
    expect(brevoSettings({ BREVO_URL: "", BREVO_API_KEY: "", EMAIL_FROM: "" })).toEqual(defaults);
  });

  it("takes BREVO_URL as it is", () => {
    expect(brevoSettings({ BREVO_URL: "http://brevo:2326/v3/smtp/email" }).url).toBe("http://brevo:2326/v3/smtp/email");
  });

  it("trims the key: pasted with a final line break, it would fail every send with a 401", () => {
    expect(brevoSettings({ BREVO_API_KEY: ` ${KEY}\r\n` }).key).toBe(KEY);
  });

  it.each([
    ["Fullcar <bonjour@fullcar.test>", { name: "Fullcar", email: "bonjour@fullcar.test" }],
    ["  Fullcar   <bonjour@fullcar.test>  ", { name: "Fullcar", email: "bonjour@fullcar.test" }],
    ["bonjour@fullcar.test", { email: "bonjour@fullcar.test" }],
    [" bonjour@fullcar.test\n", { email: "bonjour@fullcar.test" }],
    ["<bonjour@fullcar.test>", { email: "bonjour@fullcar.test" }],
  ])("reads EMAIL_FROM %j as the sender", (from, sender) => {
    expect(brevoSettings({ EMAIL_FROM: from }).from).toEqual(sender);
  });
});
