import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
// The parser @sentry/nextjs runs in the browser, and the one it runs on the server.
// @sentry/browser is not in package.json: it comes with @sentry/react, which @sentry/nextjs pins at 11.8.0.
import { defaultStackParser as browserStackParser } from "@sentry/browser";
import { type Breadcrumb, defaultStackParser as nodeStackParser, type StackFrame } from "@sentry/nextjs";
import { beforeEach, describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubCreatedDsc, scrubDsc, scrubEvent, scrubSpan, scrubText, scrubUrl, type StreamedSpan } from "./scrub";
import { actionBody, drawSecrets, leakedKinds, leakyEvent, NAMES, ORIGIN, PHONES, RELEASE, type Secrets } from "./test-secrets";
import { lowercaseBytes, mixedBytes, STATIC_FRAME, TRACE_ID, USER_AGENT } from "./test-secrets";

/*
 * No assertion here prints a secret when it fails: leaks are checked with `leakedKinds`,
 * which names kinds, and exact shapes with `isDeepStrictEqual(…) === true`.
 */

let secrets: Secrets;
beforeEach(() => {
  secrets = drawSecrets();
});

const leaks = (value: unknown) => leakedKinds(JSON.stringify(value) ?? "", secrets);
const same = (actual: unknown, expected: unknown) => expect(isDeepStrictEqual(actual, expected)).toBe(true);

describe("scrubUrl", () => {
  it("keeps the scheme, the host and the application's segments, and drops the id and the fragment", () => {
    same(scrubUrl(secrets.adminUrl), `${ORIGIN}/e/[id]/admin`);
    same(scrubUrl(secrets.personalUrl), `${ORIGIN}/e/[id]/moi`);
    same(scrubUrl(`/e/${secrets.id}?_rsc=1x2y#${secrets.adminToken}`), "/e/[id]");
  });

  it("turns every segment the application does not write into [id]", () => {
    same(scrubUrl(`https://u:${secrets.adminToken}@fullcar.example/x/${NAMES[0]}/monitoring`), `${ORIGIN}/[id]/[id]/monitoring`);
    same(scrubUrl(`tel:${PHONES[2]}`), "tel:[id]");
  });

  it("keeps the path of a build asset, without its query", () => {
    same(scrubUrl(STATIC_FRAME), `${ORIGIN}/_next/static/chunks/app/e/page-3f9ac2.js`);
  });
});

describe("scrubText", () => {
  it.each(PHONES.map((phone, at) => [at, phone]))("redacts phone number #%i, however it is written", (_, phone) => {
    const text = scrubText(`call ${phone} now, or text ${phone.replace(/\s/g, "")}`);
    same(leaks(text), []);
    same(text, "call [redacted] now, or text [redacted]");
  });

  it.each(NAMES.map((name, at) => [at, name]))("redacts quoted first name #%i, with every kind of quote", (_, name) => {
    const text = scrubText(`"${name}" '${name}' ‘${name}’ “${name}” \`${name}\` « ${name} » {"firstName":"${name}"}`);
    same(leaks(text), []);
    same(text, "[redacted] [redacted] [redacted] [redacted] [redacted] [redacted] {[redacted]:[redacted]}");
  });

  it("redacts an event's id on its own, and leaves words of 8 letters", () => {
    const text = scrubText(`event ${secrets.id} not found: x is not a function (SQLSTATE 23505)`);
    same(leaks(text), []);
    same(text, "event [redacted] not found: x is not a function (SQLSTATE 23505)");
  });

  it("redacts an event's id written in lowercase letters only", () => {
    const lowercase = drawSecrets(lowercaseBytes);
    same(scrubText(`event ${lowercase.id} not found`), "event [redacted] not found");
  });

  it("leaves the words a message needs, and its own [redacted]", () => {
    const text = "Function: required argument, expected Database instance, received Property (SQLSTATE 23505) [redacted]";
    same(scrubText(text), text);
  });

  it("redacts a quote left open, up to the end", () => {
    same(leaks(scrubText(`no seat for "${NAMES[0]} ${secrets.adminToken}`)), []);
  });

  it("leaves apostrophes, short numbers and words alone", () => {
    same(scrubText("can't read l'événement: SQLSTATE 23505 at 12:30"), "can't read l'événement: SQLSTATE 23505 at 12:30");
  });

  it("redacts tokens on their own, and scrubs URLs in place", () => {
    const text = scrubText(
      `token ${secrets.adminToken}, then ${secrets.personalToken}; open ${secrets.adminUrl} or GET /e/${secrets.id}/moi#${secrets.personalToken}`,
    );
    same(leaks(text), []);
    same(text, `token [redacted], then [redacted]; open ${ORIGIN}/e/[id]/admin or GET /e/[id]/moi`);
  });

  it("keeps a db span's double-quoted identifiers, and redacts its values", () => {
    const sql = `select "person"."id" from "person" where "first_name" = '${NAMES[1]}' and "phone" = ${PHONES[1]}`;
    same(scrubText(sql, "db"), 'select "person"."id" from "person" where "first_name" = [redacted] and "phone" = [redacted]');
  });
});

describe("scrubBreadcrumb", () => {
  it("keeps the method, the scrubbed URL and the status of a server action posted to the admin link", () => {
    const head = { type: "http", category: "fetch", level: "info", timestamp: 1792477108.148 } as const;
    const url = `/e/${secrets.id}/admin#${secrets.adminToken}`;
    const fetch: Breadcrumb = { ...head, data: { method: "POST", url, status_code: 200, request_body_size: 81 } };
    same(scrubBreadcrumb(fetch), { ...head, data: { method: "POST", url: "/e/[id]/admin", status_code: 200 } });
  });

  it("keeps a navigation to the admin link, both ends scrubbed", () => {
    const navigation: Breadcrumb = { category: "navigation", data: { from: `/e/${secrets.id}`, to: secrets.adminUrl } };
    same(scrubBreadcrumb(navigation), { category: "navigation", data: { from: "/e/[id]", to: `${ORIGIN}/e/[id]/admin` } });
  });

  it.each(["console", "ui.click", "ui.input", "sentry.event"])("drops a %s breadcrumb", (category) => {
    // Compared, not printed: a breadcrumb kept by mistake would print its name, phone and link.
    const breadcrumb = { category, message: `${NAMES[0]} ${PHONES[0]}`, data: { arguments: [secrets.adminUrl] } };
    expect(scrubBreadcrumb(breadcrumb) === null).toBe(true);
  });
});

describe("scrubEvent", () => {
  it.each(["javascript", "node"] as const)("leaves no secret anywhere in a %s event", (platform) => {
    same(leaks(scrubEvent(leakyEvent(secrets, platform))), []);
  });

  it("rebuilds the event from its allowed keys: no user, extra, tags, fingerprint or server name", () => {
    const kept = "breadcrumbs contexts debug_meta environment event_id exception level logentry message platform release request sdkProcessingMetadata timestamp transaction";
    expect(Object.keys(scrubEvent(leakyEvent(secrets))).sort()).toEqual(kept.split(" "));
  });

  it("keeps a request's method and scrubbed URL, and the browser's User-Agent only", () => {
    same(scrubEvent(leakyEvent(secrets)).request, { method: "POST", url: `${ORIGIN}/e/[id]/admin`, headers: { "User-Agent": USER_AGENT } });
    same(scrubEvent(leakyEvent(secrets, "node")).request, { method: "POST", url: `${ORIGIN}/e/[id]/admin` });
  });

  it("drops culture, react and unknown contexts, and the data of trace", () => {
    const { contexts } = scrubEvent(leakyEvent(secrets));
    same(contexts, {
      os: { name: "Android", version: "15" },
      trace: { trace_id: TRACE_ID, span_id: "80751a90a011d3f8", op: "http.client" },
      nextjs: { request_path: "/e/[id]/admin", router_kind: "App Router", router_path: "/e/[id]/admin", route_type: "action" },
    });
  });

  it("keeps the frames' places without their variables or source, the asset's path without its query", () => {
    const [exception] = scrubEvent(leakyEvent(secrets)).exception?.values ?? [];
    same(exception, {
      type: "Error",
      value: `Could not seat [redacted] ([redacted]) from ${ORIGIN}/e/[id]/admin`,
      mechanism: { type: "auto.browser.global_handlers.onerror", handled: false },
      stacktrace: {
        frames: [
          { filename: "app:///_next/static/chunks/app/e/page-3f9ac2.js", function: "onSubmit", lineno: 1, colno: 4410, in_app: true },
          { filename: `${ORIGIN}/e/[id]/admin`, abs_path: `${ORIGIN}/e/[id]/admin`, function: "?", in_app: true },
        ],
      },
    });
  });

  function frameFiles(files: string[]) {
    const event = leakyEvent(secrets, "node");
    event.exception = { values: [{ type: "Error", value: "boom", stacktrace: { frames: files.map((filename) => ({ filename })) } }] };
    return scrubEvent(event).exception?.values?.[0].stacktrace?.frames?.map((frame) => frame.filename);
  }

  it("keeps the files of the build and of Node as they are", () => {
    const files = ["app:///_next/server/chunks/ssr/[root-of-the-server]__0f3a.js", "/var/task/.next/server/app/e/[id]/admin/page.js"];
    files.push("/var/task/node_modules/next/dist/server/base-server.js", "node:internal/process/task_queues");
    same(frameFiles(files), files);
  });

  it("scrubs the path of a frame's file that is not an http URL", () => {
    const { id, adminToken, personalToken } = secrets;
    // `app:///…` is a page's frame in production: @sentry/nextjs rewrites the browser's origin.
    const files = frameFiles([`/e/${id}/admin`, `webpack-internal:///e/${id}/moi#${personalToken}`, `app:///e/${id}/admin#${adminToken}`]);
    same(files, ["/e/[id]/admin", "webpack-internal:///e/[id]/moi", "app:///e/[id]/admin"]);
  });

  /** The frames the SDK's own parsers make of a stack: a line of the message may read as one. */
  function sentFrames(parser: (stack: string) => StackFrame[], ...lines: string[]) {
    const event = leakyEvent(secrets);
    event.exception = { values: [{ type: "Error", value: "boom", stacktrace: { frames: parser(lines.join("\n")) } }] };
    return scrubEvent(event).exception?.values?.[0].stacktrace?.frames ?? [];
  }

  it("scrubs a function name the browser's parser reads in a line of the message", () => {
    const frames = sentFrames(browserStackParser, "Error: Could not seat", `${NAMES[2]} ${PHONES[0]} ${secrets.personalUrl}`);
    expect(frames.length).toBeGreaterThan(0);
    expect(leaks(frames)).toEqual([]);
  });

  it("scrubs a function name the Node parser reads in a line of the message", () => {
    const lines = [`no seat for ${NAMES[2]} ${PHONES[0]} (car full)`, `no seat ${secrets.personalToken} (car full)`];
    // With no `(`, the rest of the line becomes the frame's file: a build path in it is no pass.
    lines.push(`no seat ${NAMES[2]} ${PHONES[0]}, see /var/task/node_modules/x/index.js`);
    const frames = sentFrames(nodeStackParser, "Error: Could not seat", ...lines);
    expect(frames.length).toBeGreaterThan(0);
    expect(leaks(frames)).toEqual([]);
  });

  it("scrubs what the Node parser reads as the scheme of a frame's file", () => {
    // Secrets of letters and digits only, which always read as a scheme before a colon.
    const fixed = drawSecrets(lowercaseBytes);
    const lines = [fixed.personalToken, fixed.adminToken, fixed.id].map((secret) => `Could not seat ${secret}: car full`);
    // And the host, after `x://` (not after "seat at": "seat" already holds an "at ").
    lines.push(`no room at x://${fixed.id}/y`, `no room at db://${fixed.adminToken}`);
    const frames = sentFrames(nodeStackParser, "Error: x", ...lines);
    expect(frames.length).toBeGreaterThan(0);
    expect(leakedKinds(JSON.stringify(frames), fixed)).toEqual([]);
  });

  it("scrubs a build path the parsers read in a line of the message, with the rest of the line", () => {
    const browser = sentFrames(browserStackParser, "Error: x", `Chunk /_next/static/chunks/a.js failed for event ${secrets.id} ${PHONES[0]}`);
    const node = sentFrames(nodeStackParser, "Error: x", `failed at /_next/static/chunks/a.js from ${secrets.personalUrl}`);
    expect(browser.length * node.length).toBeGreaterThan(0);
    expect(leaks([browser, node])).toEqual([]);
  });

  it("scrubs a frame's file whose scheme is not one of the build", () => {
    const fixed = drawSecrets(lowercaseBytes);
    const lines = [`failed at ${fixed.id}://x/node_modules/y.js`, `failed at ${fixed.adminToken}:///_next/static/a.js`];
    lines.push(`failed at ${fixed.personalToken}://h/.next/server/a.js`);
    const frames = [nodeStackParser, browserStackParser].map((parser) => sentFrames(parser, "Error: x", ...lines));
    expect(frames.flat().length).toBeGreaterThan(0);
    expect(leakedKinds(JSON.stringify(frames), fixed)).toEqual([]);
  });

  /*
   * Every value sent as it is, fed a line of a message with every kind of secret, and each
   * secret alone, with no space to give it away: each must go through scrubText unless the
   * whole of it may be sent, since a prefix or a shape proves nothing.
   */
  it.each([
    ["a URL's path of the build", (line: string) => scrubUrl(`/_next/static/chunks/${line}`)],
    ["a frame's file of the build", (line: string) => frameFiles([`/var/task/node_modules/${line}`, `node:${line}`])],
    ["a frame's file, scheme included", (line: string) => frameFiles([`${line}://x/node_modules/y.js`, `${line}:///_next/static/a.js`])],
    ["a frame's function", (line: string) => sentFrames(nodeStackParser, "Error: x", `    at ${line} (app:///_next/static/a.js:1:2)`)],
    ["the event's own fields", (line: string) => verbatimEvent(line)],
    ["the browser's User-Agent", (line: string) => scrubEvent({ ...leakyEvent(secrets), request: { headers: { "User-Agent": line } } })],
    ["the trace and the system contexts", (line: string) => scrubEvent({ ...leakyEvent(secrets), contexts: { trace: { trace_id: line, span_id: line }, os: { name: line } } })],
    ["the dynamic sampling context", (line: string) => scrubDsc(Object.fromEntries(DSC_FIELDS.map((key) => [key, line])))],
    ["a span's ids and Sentry's own attributes", (line: string) => scrubSpan(span(line, { "sentry.release": line, "sentry.dist": line, "sentry.sdk.integrations": [line] }, line))],
  ])("sends %s as it is only when the whole of it may be", (_, send) => {
    const line = `Could not seat "${NAMES[0]}" (${PHONES[0]}) from ${secrets.adminUrl}, see ${secrets.personalUrl}, event ${secrets.id}`;
    expect(leaks(send(line))).toEqual([]);
    // Secrets with an uppercase letter and a digit: a fraction of ids has neither (« Limites connues »).
    const fixed = drawSecrets(mixedBytes);
    const alone = [fixed.adminToken, fixed.personalToken, fixed.id, `${ORIGIN}/e/${fixed.id}/admin`];
    expect(leakedKinds(JSON.stringify(alone.map((value) => send(value))), fixed)).toEqual([]);
    // A URL is never a name, whatever its id looks like.
    const lowercase = drawSecrets(lowercaseBytes);
    expect(leakedKinds(JSON.stringify(send(`${ORIGIN}/e/${lowercase.id}/admin`)), lowercase)).toEqual([]);
  });

  it("redacts a phone number read as a function name in a line of the message", () => {
    const node = sentFrames(nodeStackParser, "Error: x", `failed at seat.${PHONES[1]} (deleted)`, `no driver at seat.06.47.81.29.53 (car full)`);
    const browser = sentFrames(browserStackParser, "Error: x", `    at seat.${PHONES[1]} (since 10:30)`);
    expect(node.length * browser.length).toBeGreaterThan(0);
    expect(leaks([node, browser])).toEqual([]);
  });

  it("redacts an id read as a function name in a line of the message, line number or not", () => {
    const lowercase = drawSecrets(lowercaseBytes);
    const lines = [`no event at ${lowercase.id} (deleted)`, `no event at ${lowercase.id} (since 10:30:00)`];
    const node = sentFrames(nodeStackParser, "Error: x", ...lines);
    const browser = sentFrames(browserStackParser, "Error: x", `${lowercase.id}@${ORIGIN}/_next/static/chunks/page.js`, `at ${lowercase.id} (since 10:30)`);
    expect(node.length * browser.length).toBeGreaterThan(0);
    expect(leakedKinds(JSON.stringify([node, browser]), lowercase)).toEqual([]);
    // Next to a `$`, which a function's name may hold and a word may not: in a frame of code too, with a digit.
    for (const fixed of [lowercase, drawSecrets(mixedBytes)]) {
      const glued = [sentFrames(nodeStackParser, "Error: x", `no event at $${fixed.id} (deleted)`, `failed at seat.$${fixed.id} (deleted)`)];
      glued.push(sentFrames(browserStackParser, "Error: x", `    at $${fixed.id} (since 10:30)`, `$${fixed.id}@/_next/static/chunks/a.js`));
      if (fixed !== lowercase) glued.push(sentFrames(nodeStackParser, "Error: x", `    at $${fixed.id} (app:///_next/static/a.js:1:2)`));
      expect(leakedKinds(JSON.stringify(glued), fixed)).toEqual([]);
    }
  });

  it("keeps the function names of real frames", () => {
    const lines = ["at async onSubmit (app:///_next/static/chunks/page.js:1:4410)", "at new SeatPicker (app:///_next/static/chunks/page.js:2:10)"];
    lines.push("at Object.<anonymous> (/var/task/.next/server/app/page.js:3:7)", "at Array.map (<anonymous>)");
    lines.push("at useState (app:///_next/static/chunks/page.js:4:1)", "at new Promise (<anonymous>)");
    const frames = sentFrames(nodeStackParser, "Error: boom", ...lines.map((line) => `    ${line}`));
    same(frames.map((frame) => frame.function), ["new Promise", "useState", "Array.map", "Object.?", "new SeatPicker", "onSubmit"]);
  });

  it("keeps only the navigations and requests among the breadcrumbs", () => {
    same(scrubEvent(leakyEvent(secrets)).breadcrumbs, [
      { type: "http", category: "fetch", data: { method: "POST", url: "/e/[id]/admin", status_code: 200 } },
    ]);
  });

  it("scrubs the transaction of the dynamic sampling context, which becomes the envelope's header", () => {
    const dynamicSamplingContext = { trace_id: TRACE_ID, public_key: "public", release: RELEASE, transaction: `${ORIGIN}/e/[id]/admin` };
    same(scrubEvent(leakyEvent(secrets)).sdkProcessingMetadata, { dynamicSamplingContext });
  });
});

describe("scrubCreatedDsc", () => {
  it("scrubs the context in place, the object the SDK keeps", () => {
    const dsc = { trace_id: TRACE_ID, transaction: `GET /e/${secrets.id}/admin`, replay_id: secrets.personalToken };
    scrubCreatedDsc(dsc);
    same(dsc, { trace_id: TRACE_ID, transaction: "GET /e/[id]/admin" });
  });
});

/** The fields of an event the SDK writes, each set to `line`. */
function verbatimEvent(line: string) {
  const event = { ...leakyEvent(secrets), event_id: line, platform: line, release: line, dist: line, environment: line };
  event.sdk = { name: line, version: line, integrations: [line], packages: [{ name: line, version: line }] };
  event.exception = { values: [{ type: line, value: "x", mechanism: { type: line, source: line } }] };
  return scrubEvent(event);
}

const DSC_FIELDS = ["trace_id", "public_key", "sample_rate", "release", "environment", "sampled", "sample_rand", "org_id", "transaction"];

function span(name: string, attributes: Record<string, unknown>, id?: string): StreamedSpan {
  const [trace_id, parent_span_id, span_id] = id ? [id, id, id] : [TRACE_ID, "80751a90a011d3f8", "a6d9c73efedbf1df"];
  const links = [{ trace_id, span_id: parent_span_id, attributes: { "url.full": secrets.adminUrl } }];
  return { trace_id, parent_span_id, span_id, name, start_timestamp: 1792477108.149, end_timestamp: 1792477108.15, status: "ok", is_segment: false, attributes, links };
}

describe("scrubSpan", () => {
  it("keeps of an http.client span its method, status and Sentry's own attributes, and drops the fragment", () => {
    const sent = scrubSpan(
      span(`POST /e/${secrets.id}/admin#${secrets.adminToken}`, {
        "sentry.op": "http.client",
        "sentry.origin": "auto.http.browser",
        "sentry.segment.name": `/e/${secrets.id}/admin`,
        "sentry.release": RELEASE,
        "sentry.user.username": NAMES[0],
        "user.ip_address": "203.0.113.7",
        "http.request.method": "POST",
        "http.response.status_code": 200,
        "http.fragment": secrets.adminToken,
        "url.full": secrets.adminUrl,
        "http.route": `/e/${secrets.id}/admin`,
        "http.request.header.referer": secrets.adminUrl,
      }),
    );
    same(leaks(sent), []);
    same(sent.name, "POST /e/[id]/admin");
    same(sent.attributes, {
      "sentry.op": "http.client",
      "sentry.origin": "auto.http.browser",
      "sentry.segment.name": "/e/[id]/admin",
      "sentry.release": RELEASE,
      "http.request.method": "POST",
      "http.response.status_code": 200,
      "http.route": "/e/[id]/admin",
    });
    expect(sent.links === undefined).toBe(true);
  });

  it("keeps of a db span its system and operation, and drops its query and parameters", () => {
    const sent = scrubSpan(
      span(`insert into "person" ("first_name", "phone") values ('${NAMES[5]}', '${PHONES[6]}')`, {
        "sentry.op": { value: "db", type: "string" },
        "db.system": { value: "postgresql", type: "string" },
        "db.operation": "INSERT",
        "db.query.text": `insert into "person" ("first_name", "phone", "token_hash") values ('${NAMES[5]}', $1, $2)`,
        "db.query.parameter.0": PHONES[6],
        "db.query.parameter.1": secrets.personalToken,
      }),
    );
    same(leaks(sent), []);
    same(sent.name, 'insert into "person" ("first_name", "phone") values ([redacted], [redacted])');
    same(sent.attributes, {
      "sentry.op": { value: "db", type: "string" },
      "db.system": { value: "postgresql", type: "string" },
      "db.operation": "INSERT",
    });
  });

  it("still scrubs the name when an attribute cannot be read", () => {
    const hostile = Object.defineProperty({}, "url.full", {
      enumerable: true,
      get() {
        throw new Error("unreadable");
      },
    });
    same(scrubSpan(span(secrets.adminUrl, hostile)).name, `${ORIGIN}/e/[id]/admin`);
  });
});

describe("the module", () => {
  it("imports only types from the SDK: nothing of it runs where it is imported", () => {
    const source = readFileSync(new URL("./scrub.ts", import.meta.url), "utf8");
    const imports = source.split("\n").filter((line) => line.includes("@sentry/"));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((line) => line.startsWith("import type "))).toBe(true);
  });

  it("finds every kind of secret when nothing is scrubbed, so that [] means something", () => {
    const kinds = ["admin link", "admin token", "event id", "name", "personal link", "personal token", "phone"];
    expect(leaks(leakyEvent(secrets))).toEqual(kinds);
    expect(leaks(actionBody(secrets))).toEqual(["event id", "name", "personal token", "phone"]);
  });
});
