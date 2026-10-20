import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { Breadcrumb } from "@sentry/nextjs";
import { beforeEach, describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubCreatedDsc, scrubEvent, scrubSpan, scrubText, scrubUrl, type StreamedSpan } from "./scrub";
import { actionBody, drawSecrets, leakedKinds, leakyEvent, NAMES, ORIGIN, PHONES, RELEASE, type Secrets } from "./test-secrets";
import { STATIC_FRAME, TRACE_ID, USER_AGENT } from "./test-secrets";

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
    const text = scrubText(`"${name}" '${name}' “${name}” « ${name} » {"firstName":"${name}"}`);
    same(leaks(text), []);
    same(text, '[redacted] [redacted] [redacted] [redacted] {[redacted]:[redacted]}');
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
    expect(scrubBreadcrumb({ category, message: `${NAMES[0]} ${PHONES[0]}`, data: { arguments: [secrets.adminUrl] } })).toBeNull();
  });
});

describe("scrubEvent", () => {
  it.each(["javascript", "node"] as const)("leaves no secret anywhere in a %s event", (platform) => {
    same(leaks(scrubEvent(leakyEvent(secrets, platform))), []);
  });

  it("rebuilds the event from its allowed keys: no user, extra, tags, fingerprint or server name", () => {
    const kept = "breadcrumbs contexts environment event_id exception level message platform release request sdkProcessingMetadata timestamp transaction";
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
          { filename: `${ORIGIN}/_next/static/chunks/app/e/page-3f9ac2.js`, function: "onSubmit", lineno: 1, colno: 4410, in_app: true },
          { filename: `${ORIGIN}/e/[id]/admin`, abs_path: `${ORIGIN}/e/[id]/admin`, function: "?", lineno: 12, colno: 7, in_app: true },
        ],
      },
    });
  });

  it("keeps a server frame's file as it is", () => {
    const event = leakyEvent(secrets, "node");
    const frame = { filename: "app:///_next/server/chunks/ssr/[root-of-the-server]__0f3a.js", lineno: 3 };
    event.exception = { values: [{ type: "Error", value: "boom", stacktrace: { frames: [frame] } }] };
    same(scrubEvent(event).exception?.values?.[0].stacktrace?.frames, [frame]);
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

function span(name: string, attributes: Record<string, unknown>): StreamedSpan {
  const [trace_id, parent_span_id, span_id] = [TRACE_ID, "80751a90a011d3f8", "a6d9c73efedbf1df"];
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
    expect(sent.links).toBeUndefined();
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
    expect(leaks(leakyEvent(secrets))).toEqual(["admin link", "admin token", "event id", "name", "personal token", "phone"]);
    expect(leaks(actionBody(secrets))).toEqual(["event id", "name", "personal token", "phone"]);
  });
});
