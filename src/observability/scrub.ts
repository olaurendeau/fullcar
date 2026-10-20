import type { Breadcrumb, ErrorEvent, NodeOptions, StackFrame } from "@sentry/nextjs";

/*
 * What may leave for Sentry: never a token, an admin link, a phone number or a name
 * (docs/agents/architecture.md, "Jetons"; #231). Each hook rebuilds what it sends from an
 * allowlist instead of deleting what it knows of: a field the SDK adds tomorrow stays home.
 * Pure functions: only types come from the SDK, nothing of it runs here.
 */

/** A span as `beforeSendSpan` receives it, with streamed spans (the default in v11). */
export type StreamedSpan = Parameters<NonNullable<NodeOptions["beforeSendSpan"]>>[0];

const REDACTED = "[redacted]";
const ID = "[id]";

/** The path segments the application writes itself; any other segment is data. */
const LITERAL_SEGMENTS = new Set(["e", "admin", "moi", "monitoring"]);
/** Build assets: their path names a chunk, never a person. */
const STATIC_PATH = "/_next/static/";

/** Scheme, authority (after `//`) and path: the query and the fragment are left out. */
const URL_PARTS = /^([a-z][a-z\d+.-]*:)?(?:\/\/([^/?#]*))?([^?#]*)/i;

/**
 * The scheme and the host, and of the path only the application's own segments:
 * `https://h/e/Ab3d…/admin?x#token` becomes `https://h/e/[id]/admin`. The event's id goes
 * too. Credentials before `@` go; the paths of `/_next/static/…` are kept.
 */
export function scrubUrl(url: string): string {
  const [, scheme = "", authority, path = ""] = URL_PARTS.exec(url) ?? [];
  const host = authority === undefined ? "" : `//${authority.slice(authority.lastIndexOf("@") + 1)}`;
  if (path.startsWith(STATIC_PATH)) return `${scheme}${host}${path}`;
  const segments = path.split("/").map((segment) => (segment === "" || LITERAL_SEGMENTS.has(segment) ? segment : ID));
  return `${scheme}${host}${segments.join("/")}`;
}

/** Files of the build and of Node, which name code and never a person. */
const BUILD_FILE = /^node:|^(?:[a-z][\w+.-]*:\/\/)?\/_next\/|\/\.next\/|\/node_modules\//i;

/**
 * A frame's file: a file of the build (`app:///_next/…`, `…/.next/…`, `…/node_modules/…`,
 * `node:…`) as it is, without query nor fragment; anything else, a page among them, through
 * `scrubUrl`.
 */
function scrubLocation(location: string): string {
  const file = location.split(/[?#]/, 1)[0];
  return !/^https?:/i.test(file) && BUILD_FILE.test(file) ? file : scrubUrl(location);
}

/*
 * Quoted passages, an unclosed one up to the end of the text. A single quote opens only
 * after something that is not a letter (« can't », « l'événement » are apostrophes), and
 * one followed by a letter does not close (N'Golo, and N’Golo between ‘ and ’).
 */
const DOUBLE_QUOTED = /"(?:[^"\\]|\\[\s\S])*(?:"|$)/g;
const OTHER_QUOTED = [
  /(?<![\p{L}\p{N}])'(?:[^'\\]|\\[\s\S]|'(?=[\p{L}\p{N}]))*(?:'(?![\p{L}\p{N}])|$)/gu,
  /‘(?:[^’]|’(?=[\p{L}\p{N}]))*(?:’(?![\p{L}\p{N}])|$)/gu,
  /“[^”]*(?:”|$)/g,
  /`[^`]*(?:`|$)/g,
  /«[^»]*(?:»|$)/g,
];

/*
 * Then, left to right: a URL (with a scheme, or a path after a space or a bracket); a run of
 * 22 base64url characters or more, a token's length; 8 symbols of an event's id
 * (public-id-format.ts); a run of digits that may be a phone number, with `+ . ( ) / _ -`
 * and spaces. Two numbers side by side read as one longer run, hence 6 digits or more
 * rather than 6 to 15.
 */
const IN_TEXT =
  /([a-zA-Z][a-zA-Z\d+.-]*:\/\/[^\s"'`<>]*|(?<![^\s([{<=,;:])\/[^\s"'`<>]*)|((?<![\w-])[\w-]{22,}(?![\w-]))|((?<![\w-])[2-9A-HJ-NP-Za-km-z]{8}(?![\w-]))|(?<!\d)\+?\(?\d(?:[\d \t\u00a0\u202f.()/_-]*\d)?/gu;
const PHONE_DIGITS = 6;
/**
 * The words of 8 letters a message needs, in any case: any other run of 8 symbols of the
 * alphabet is taken for an id. A word with an `l` never is one: the alphabet has no `l`.
 */
const KEPT_WORDS = new Set("argument database expected function instance property received redacted required sqlstate".split(" "));

/**
 * A message or a span's name without what may name someone: URLs through `scrubUrl`, and
 * quoted passages, token-like runs and phone numbers replaced by `[redacted]`. A `db` span
 * keeps its double-quoted identifiers (`"person"."id"`): SQL quotes its values with `'`.
 */
export function scrubText(text: string, kind: "text" | "db" = "text"): string {
  let scrubbed = String(text);
  for (const quoted of kind === "db" ? OTHER_QUOTED : [DOUBLE_QUOTED, ...OTHER_QUOTED]) {
    scrubbed = scrubbed.replace(quoted, REDACTED);
  }
  return scrubbed.replace(IN_TEXT, (match: string, url?: string, run?: string, id?: string) => {
    if (url) return scrubUrl(url);
    if (id) return KEPT_WORDS.has(id.toLowerCase()) ? id : REDACTED;
    if (run || (match.match(/\d/g) ?? []).length >= PHONE_DIGITS) return REDACTED;
    return match;
  });
}

const KEPT_CATEGORIES = new Set(["navigation", "fetch", "xhr", "http"]);
const BREADCRUMB_TYPES = new Set(["default", "http", "navigation"]);
const LEVELS = new Set(["fatal", "error", "warning", "log", "info", "debug"]);
const METHOD = /^[A-Z]{1,10}$/;

/** `beforeBreadcrumb`: navigations and requests, their URLs scrubbed; nothing else. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  try {
    const { category, type, level, timestamp } = breadcrumb;
    if (typeof category !== "string" || !KEPT_CATEGORIES.has(category)) return null;
    const data = record(breadcrumb.data);
    return compact({
      type: typeof type === "string" && BREADCRUMB_TYPES.has(type) ? type : undefined,
      category,
      level: typeof level === "string" && LEVELS.has(level) ? level : undefined,
      timestamp: finite(timestamp),
      data: compact({
        method: method(data.method),
        url: stringOr(data.url, scrubUrl),
        status_code: finite(data.status_code),
        from: stringOr(data.from, scrubUrl),
        to: stringOr(data.to, scrubUrl),
      }),
    });
  } catch {
    return null;
  }
}

/** `beforeSend`: the event rebuilt from an allowlist of its top-level keys. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const dsc = record(record(event.sdkProcessingMetadata).dynamicSamplingContext);
  return compact({
    type: undefined,
    event_id: stringOr(event.event_id),
    timestamp: finite(event.timestamp),
    level: typeof event.level === "string" && LEVELS.has(event.level) ? event.level : undefined,
    platform: stringOr(event.platform),
    release: stringOr(event.release),
    dist: stringOr(event.dist),
    environment: stringOr(event.environment),
    sdk: event.sdk,
    transaction: stringOr(event.transaction, scrubText),
    message: stringOr(event.message, scrubText),
    logentry: event.logentry && compact({ message: stringOr(event.logentry.message, scrubText) }),
    exception: event.exception && { values: list(event.exception.values).map(scrubException) },
    request: event.request && scrubRequest(event.request, event.platform === "javascript"),
    breadcrumbs: event.breadcrumbs && list(event.breadcrumbs).map(scrubBreadcrumb).filter((b) => b !== null),
    contexts: event.contexts && scrubContexts(record(event.contexts)),
    debug_meta: event.debug_meta && {
      images: list(event.debug_meta.images).map((image) => {
        const { code_file } = record(image);
        return { ...image, ...(typeof code_file === "string" && { code_file: scrubLocation(code_file) }) };
      }) as NonNullable<ErrorEvent["debug_meta"]>["images"],
    },
    sdkProcessingMetadata: Object.keys(dsc).length ? { dynamicSamplingContext: scrubDsc(dsc) } : undefined,
  });
}

type Exception = NonNullable<NonNullable<ErrorEvent["exception"]>["values"]>[number];

function scrubException(exception: Exception): Exception {
  const mechanism = record(exception.mechanism);
  return compact({
    type: stringOr(exception.type),
    value: stringOr(exception.value, scrubText),
    mechanism: exception.mechanism && {
      type: stringOr(mechanism.type) ?? "generic",
      ...compact({
        handled: bool(mechanism.handled),
        synthetic: bool(mechanism.synthetic),
        source: stringOr(mechanism.source),
        exception_id: finite(mechanism.exception_id),
        parent_id: finite(mechanism.parent_id),
        is_exception_group: bool(mechanism.is_exception_group),
      }),
    },
    stacktrace: exception.stacktrace && { frames: list(exception.stacktrace.frames).map(scrubFrame) },
  });
}

/** What V8 and the SDK's parsers name a function: `onSubmit`, `new Seat`, `Object.?`, `a.b [as c]`. */
const FUNCTION_NAME = /^(?:new )?[A-Za-z_$<?][\w$<>?]*(?:\.[\w$<>?]+)*(?: \[as [\w$]+\])?$/;
/** A part of such a name that may still be a token, or an id with a digit in it. */
const SECRET_PART = /(?<![\w$])(?:[\w$]{22,}|(?=\w*\d)[2-9A-HJ-NP-Za-km-z]{8})(?![\w$])/;

/**
 * A function's name as it is, when it reads as one: through `scrubText`, `onSubmit` would
 * read as an id. The SDK's parsers make a frame of any line of a message that looks like
 * one, and its words become the name: a name that does not read as one is not sent at all,
 * since `scrubText` cannot tell a first name from a word.
 */
function scrubFunctionName(name: string): string {
  if (!FUNCTION_NAME.test(name)) return REDACTED;
  return SECRET_PART.test(name) ? scrubText(name) : name;
}

/** Where the code ran, and nothing it held: no `vars`, no lines of source. */
function scrubFrame(frame: StackFrame): StackFrame {
  return compact({
    filename: stringOr(frame.filename, scrubLocation),
    abs_path: stringOr(frame.abs_path, scrubLocation),
    module: stringOr(frame.module, scrubLocation),
    function: stringOr(frame.function, scrubFunctionName),
    lineno: finite(frame.lineno),
    colno: finite(frame.colno),
    in_app: bool(frame.in_app),
  });
}

/** `{ method?, url }`, and the browser's `User-Agent`: no cookie, header, body, query or env. */
function scrubRequest(request: NonNullable<ErrorEvent["request"]>, browser: boolean): ErrorEvent["request"] {
  const userAgent = Object.entries(record(request.headers)).find(([name]) => name.toLowerCase() === "user-agent")?.[1];
  return compact({
    method: method(request.method),
    url: stringOr(request.url, scrubUrl),
    headers: browser && typeof userAgent === "string" ? { "User-Agent": userAgent } : undefined,
  });
}

/** System contexts as they are; `trace` without its `data`, `nextjs` with its paths scrubbed. */
const SYSTEM_CONTEXTS = ["app", "cloud_resource", "device", "os", "runtime"];

function scrubContexts(contexts: Record<string, unknown>): ErrorEvent["contexts"] {
  const kept: Record<string, Record<string, unknown>> = {};
  for (const name of SYSTEM_CONTEXTS) if (contexts[name]) kept[name] = record(contexts[name]);
  const { trace, nextjs, response } = contexts as Record<string, Record<string, unknown> | undefined>;
  const ids = { trace_id: asIs, span_id: asIs, parent_span_id: asIs };
  if (trace) kept.trace = pick(trace, { ...ids, op: scrubText, status: scrubText, origin: scrubText });
  if (nextjs) kept.nextjs = pick(nextjs, { request_path: scrubUrl, router_kind: scrubText, router_path: scrubUrl, route_type: scrubText });
  if (response) kept.response = compact({ status_code: finite(response.status_code) });
  return kept;
}

/**
 * The dynamic sampling context, which becomes the envelope's `trace` header: its
 * `transaction` may be the raw URL of the page.
 */
export function scrubDsc(dsc: Record<string, unknown>): Record<string, unknown> {
  const kept = { trace_id: asIs, public_key: asIs, sample_rate: asIs, release: asIs, environment: asIs, sampled: asIs };
  return pick(dsc, { ...kept, sample_rand: asIs, org_id: asIs, transaction: scrubText });
}

/**
 * For `client.on("createDsc", …)`: a span envelope's `trace` header comes from the segment
 * span itself, and none of the three hooks sees it. The SDK keeps the object it hands over,
 * so it is scrubbed in place.
 */
export function scrubCreatedDsc(dsc: object): void {
  const created = dsc as Record<string, unknown>;
  const kept = scrubDsc(created);
  for (const key of Object.keys(created)) if (!(key in kept)) delete created[key];
  Object.assign(created, kept);
}

/*
 * Span attributes: Sentry's own, scrubbed like a text, but not those that carry a person
 * or an event (`sentry.user.*`, `sentry.event.*`); the method, the status, the route, the
 * database and its operation. `http.fragment`, `url.*`, `db.query.*` and the rest stay home.
 */
const VERBATIM_ATTRIBUTES = new Set(["sentry.release", "sentry.dist", "sentry.sdk.integrations"]);
const DROPPED_SENTRY = /^sentry\.(user|event)\./;
const METHOD_ATTRIBUTES = new Set(["http.request.method", "http.method"]);
const STATUS_ATTRIBUTES = new Set(["http.response.status_code", "http.status_code"]);
const DB_ATTRIBUTES = new Set(["db.system", "db.system.name", "db.operation", "db.operation.name"]);

function scrubAttribute(key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const { value: inner, type, unit } = value as { value?: unknown; type?: unknown; unit?: unknown };
    const scrubbed = scrubAttribute(key, inner);
    return scrubbed === undefined ? undefined : compact({ value: scrubbed, type, unit });
  }
  const text = (each: (s: string) => string) =>
    Array.isArray(value) ? value.map((v) => (typeof v === "string" ? each(v) : v)) : typeof value === "string" ? each(value) : value;
  if (key.startsWith("sentry.")) {
    if (DROPPED_SENTRY.test(key)) return undefined;
    return VERBATIM_ATTRIBUTES.has(key) ? value : text(scrubText);
  }
  if (METHOD_ATTRIBUTES.has(key)) return method(value);
  if (STATUS_ATTRIBUTES.has(key)) return finite(value);
  if (key === "http.route") return stringOr(value, scrubUrl);
  if (DB_ATTRIBUTES.has(key)) return stringOr(value, scrubText);
  return undefined;
}

/**
 * `beforeSendSpan`: the name scrubbed, the attributes of the allowlist, no links. The SDK
 * sends the span unmodified if this throws, so nothing in it may.
 */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  const attributes: Record<string, unknown> = {};
  try {
    for (const [key, value] of Object.entries(record(span.attributes))) {
      const scrubbed = scrubAttribute(key, value);
      if (scrubbed !== undefined) attributes[key] = scrubbed;
    }
  } catch {
    // An attribute that cannot be read is not sent; the others stay.
  }
  const op = attributes["sentry.op"];
  const db = "db.system" in attributes || "db.system.name" in attributes || (typeof op === "string" && op.startsWith("db"));
  let name = REDACTED;
  try {
    name = scrubText(span.name, db ? "db" : "text");
  } catch {
    // A name that cannot be read is sent as `[redacted]`.
  }
  return compact({
    trace_id: span.trace_id,
    parent_span_id: span.parent_span_id,
    span_id: span.span_id,
    name,
    start_timestamp: span.start_timestamp,
    end_timestamp: span.end_timestamp,
    status: span.status === "error" ? "error" : "ok",
    is_segment: span.is_segment === true,
    attributes,
  }) as StreamedSpan;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function list<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function method(value: unknown): string | undefined {
  return typeof value === "string" && METHOD.test(value) ? value : undefined;
}

const asIs = (s: string) => s;

function stringOr(value: unknown, scrub: (s: string) => string = asIs): string | undefined {
  return typeof value === "string" ? scrub(value) : undefined;
}

/** The string fields of `source` that `fields` names, each through its own scrubber. */
function pick(source: Record<string, unknown>, fields: Record<string, (s: string) => string>): Record<string, unknown> {
  return compact(Object.fromEntries(Object.entries(fields).map(([key, scrub]) => [key, stringOr(source[key], scrub)])));
}

/** The object without its `undefined` keys, which JSON drops anyway. */
function compact<T extends object>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T;
}
