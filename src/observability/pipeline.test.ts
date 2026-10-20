import { isDeepStrictEqual } from "node:util";
import {
  addBreadcrumb,
  captureEvent,
  captureException,
  createTransport,
  defaultStackParser,
  NodeClient,
  type NodeOptions,
  setContext,
  setCurrentClient,
  setExtra,
  setTag,
  setUser,
  spanStreamingIntegration,
  startSpan,
  withIsolationScope,
  withScope,
} from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubCreatedDsc, scrubEvent, scrubSpan } from "./scrub";
import { actionBody, drawSecrets, leakedKinds, leakyEvent, NAMES, ORIGIN, PHONES, RELEASE, type Secrets } from "./test-secrets";

/*
 * The whole way out, through a real NodeClient: its transport is handed the serialized
 * envelope, headers included, exactly what would leave for Sentry. The spans are the SDK's
 * own, streamed (the v11 default) without OpenTelemetry: `beforeSendSpan` runs on them in
 * the client, not called by hand.
 */

/** Every kind of collection off: what `sendDefaultPii: false` was before v11. */
const DATA_COLLECTION_OFF = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
} satisfies Required<NonNullable<NodeOptions["dataCollection"]>>;

const HOOKS = { beforeSend: scrubEvent, beforeSendSpan: scrubSpan, beforeBreadcrumb: scrubBreadcrumb };

let sent: string[];
let client: NodeClient;
let secrets: Secrets;

function start(hooks: Partial<typeof HOOKS> = HOOKS) {
  client = new NodeClient({
    dsn: "https://public@o1.ingest.de.sentry.io/2",
    release: RELEASE,
    environment: "production",
    tracesSampleRate: 1,
    sendClientReports: false,
    dataCollection: DATA_COLLECTION_OFF,
    integrations: [spanStreamingIntegration()],
    stackParser: defaultStackParser,
    transport: (options) =>
      createTransport(options, async ({ body }) => {
        sent.push(typeof body === "string" ? body : new TextDecoder().decode(body));
        return { statusCode: 200 };
      }),
    ...hooks,
  });
  setCurrentClient(client);
  client.init();
  // The trace header of a span envelope comes from the segment span: no hook above sees it.
  if (hooks.beforeSendSpan) client.on("createDsc", scrubCreatedDsc);
}

beforeEach(() => {
  sent = [];
  secrets = drawSecrets();
});

afterEach(async () => {
  await client.close();
});

/** Each envelope's header and items, parsed from what the transport was handed. */
function envelopes() {
  return sent.map((body) => body.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>));
}

/** Everything on the scope, the way an integration or a careless line of ours would put it. */
function fillScope() {
  setUser({ id: secrets.personalToken, username: NAMES[0], ip_address: "203.0.113.7" });
  setExtra("body", actionBody(secrets));
  setTag("person", NAMES[1]);
  setContext("culture", { locale: "fr-FR", timezone: "Europe/Paris" });
  setContext("react", { version: "19.3.0", props: { firstName: NAMES[2] } });
  addBreadcrumb({ category: "fetch", type: "http", data: { method: "POST", url: `/e/${secrets.id}/admin#${secrets.adminToken}` } });
  addBreadcrumb({ category: "navigation", data: { from: `/e/${secrets.id}`, to: secrets.adminUrl } });
  addBreadcrumb({ category: "console", message: `${NAMES[3]} ${PHONES[1]}` });
  addBreadcrumb({ category: "ui.click", message: `button[aria-label="${NAMES[4]}"]` });
}

/** An error thrown in the page on the admin link: its stack points at the document and at a chunk. */
function pageError() {
  const error = new Error(`Could not seat "${NAMES[5]}" (${PHONES[3]}) from ${secrets.adminUrl}`);
  error.stack = [
    `Error: ${error.message}`,
    `    at seat (${secrets.adminUrl}:12:7)`,
    `    at onSubmit (${ORIGIN}/_next/static/chunks/app/page-3f9ac2.js?dpl=dpl_8Hn2kQ:1:4410)`,
  ].join("\n");
  return error;
}

/** Errors and spans, each with every secret in it. */
async function sendEverything() {
  await withIsolationScope(() =>
    withScope(() => {
      fillScope();
      startSpan({ name: `GET /e/${secrets.id}/admin`, attributes: { "sentry.source": "route" } }, () => {
        const request = { "http.fragment": secrets.adminToken, "url.full": secrets.adminUrl, "http.request.method": "POST" };
        startSpan({ name: `POST ${secrets.adminUrl}`, op: "http.client", attributes: request }, () => {});
        const insert = `insert into "person" ("first_name", "phone") values ('${NAMES[0]}', '${PHONES[4]}')`;
        const query = { "db.system": "postgresql", "db.query.text": insert, "db.query.parameter.0": NAMES[0], "db.query.parameter.1": PHONES[4] };
        startSpan({ name: insert, op: "db", attributes: query }, () => {});
        captureException(pageError());
        captureEvent(leakyEvent(secrets));
      });
    }),
  );
  await client.flush(2000);
}

describe("what a NodeClient sends, through the hooks", () => {
  it("carries no secret in any envelope, headers included", async () => {
    start();
    await sendEverything();
    expect(leakedKinds(sent.join("\n"), secrets)).toEqual([]);
  });

  it("sends the two errors and the three spans, so that nothing was dropped instead of scrubbed", async () => {
    start();
    await sendEverything();
    const items = envelopes().map(([, type]) => type);
    expect(items).toEqual([
      { type: "event" },
      { type: "event" },
      { type: "span", item_count: 3, content_type: "application/vnd.sentry.items.span.v2+json" },
    ]);
  });

  it("keeps where the error happened, scrubbed", async () => {
    start();
    await sendEverything();
    const [[, , thrown]] = envelopes();
    const { values } = thrown.exception as { values: { stacktrace: { frames: { filename: string }[] } }[] };
    const files = values[0].stacktrace.frames.map((frame) => frame.filename);
    const expected = [`${ORIGIN}/_next/static/chunks/app/page-3f9ac2.js`, `${ORIGIN}/e/[id]/admin`];
    expect(isDeepStrictEqual(files, expected)).toBe(true);
  });

  it("scrubs the transaction of each envelope's trace header", async () => {
    start();
    await sendEverything();
    const transactions = envelopes().map(([header]) => (header.trace as { transaction?: string }).transaction);
    expect(isDeepStrictEqual(transactions, ["GET /e/[id]/admin", `${ORIGIN}/e/[id]/admin`, "GET /e/[id]/admin"])).toBe(true);
  });

  it("collects nothing with dataCollection off", () => {
    start();
    expect(client.getDataCollectionOptions()).toEqual({ ...DATA_COLLECTION_OFF, httpHeaders: { request: false, response: false } });
  });
});

describe("what a NodeClient sends without the hooks", () => {
  it("carries every kind of secret, so that [] above means something", async () => {
    start({});
    await sendEverything();
    expect(leakedKinds(sent.join("\n"), secrets)).toEqual(["admin link", "admin token", "event id", "name", "personal token", "phone"]);
  });
});
