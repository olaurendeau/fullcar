import type { Breadcrumb, ErrorEvent, NodeOptions, StackFrame } from "@sentry/nextjs";

/*
 * What may leave for Sentry: never a token, an admin link, a phone number or a name
 * (docs/agents/architecture.md, "Jetons"; #231). Each hook rebuilds what it sends from an
 * allowlist instead of deleting what it knows of: a field the SDK adds tomorrow stays home.
 * Pure functions: only types come from the SDK, nothing of it runs here.
 *
 * The invariant: a value is sent as it is only if the whole of it matches a strict set of
 * characters, those such a value really has, and never whitespace (`NAME`, `HEX`, `safePath`,
 * `FUNCTION_NAME`, a fixed list). Anything else goes through `scrubText`. A prefix or a shape
 * proves nothing: the SDK's stack parsers make frames of the lines of a message, and the rest
 * of such a line lands in a file, a scheme or a function's name.
 */

/**
 * A run a token or an id could be: 22 base64url characters or 8 symbols of an id, with an
 * uppercase letter, which names, versions, chunks and git SHAs written in lowercase lack.
 */
const SECRET_RUN = /(?<![\w-])(?=[\w-]*[A-Z])(?:[\w-]{22,}|[2-9A-HJ-NP-Za-km-z]{8})(?![\w-])/;

/**
 * Names, versions and identifiers the SDK and the build write: `sentry.javascript.node`,
 * `11.8.0`, `errors[0]`, `npm:@scope/name`. Their characters only, no URL (`://`) and no
 * secret's run: a field our code fills (an `error.name`) may hold anything.
 */
const NAME = /^[\w.$:@/+[\]-]+$/;
const HEX = /^[\da-f]+$/i;
const name = (value: string) => (NAME.test(value) && !value.includes("://") && !SECRET_RUN.test(value) ? value : scrubText(value));
const hex = (value: string) => (HEX.test(value) ? value : scrubText(value));

/** A path of the build: its characters only, and no secret's run. */
const PATH = /^[\w.\-/[\]()@+%~]+$/;
const safePath = (path: string) => PATH.test(path) && !SECRET_RUN.test(path);

/** A span as `beforeSendSpan` receives it, with streamed spans (the default in v11). */
export type StreamedSpan = Parameters<NonNullable<NodeOptions["beforeSendSpan"]>>[0];

const REDACTED = "[redacted]";
const ID = "[id]";

/** The path segments the application writes itself; any other segment is data. */
const LITERAL_SEGMENTS = new Set(["e", "admin", "moi", "monitoring", "api", "lieux", "tuiles"]);
/** Build assets: their path names a chunk, never a person. */
const STATIC_PATH = "/_next/static/";

/** Scheme, authority (after `//`) and path: the query and the fragment are left out. */
const URL_PARTS = /^([a-z][a-z\d+.-]*:)?(?:\/\/([^/?#]*))?([^?#]*)/i;

/**
 * The scheme and the host, and of the path only the application's own segments:
 * `https://h/e/Ab3d…/admin?x#token` becomes `https://h/e/[id]/admin`. The event's id goes
 * too. Credentials before `@` go; the paths of `/_next/static/…` are kept. The scheme and
 * the host go through `scrubText`: from a line of a message, the Node parser makes a "URL"
 * whose scheme is whatever came before a colon.
 */
export function scrubUrl(url: string): string {
  return scrubUrlWith(url, scrubText);
}

/**
 * A host name as DNS writes it, lowercase, with a dot and a TLD of letters, and an optional
 * port. Each label is shorter than a token's 22 characters, and digits are counted apart:
 * neither a token nor a phone number is one. An id's 8 letters may be one (`geoapify`).
 */
const HOST_NAME = /^(?:[a-z\d](?:[a-z\d-]{0,19}[a-z\d])?\.)+[a-z]{2,21}(?::\d{1,5})?$/;

/**
 * The URL of a request the application made, as the SDK writes it in a breadcrumb or an
 * `http.client` span: its host names a service, and is kept when it is a host name (#565).
 * Any other host, and every host of a message or a frame, goes through `scrubText`.
 */
function scrubRequestUrl(url: string): string {
  return scrubUrlWith(url, (host) => (HOST_NAME.test(host) && digitCount(host.split(":", 1)[0]) < PHONE_DIGITS ? host : scrubText(host)));
}

function scrubUrlWith(url: string, scrubHost: (host: string) => string): string {
  const [, scheme = "", authority, path = ""] = URL_PARTS.exec(url) ?? [];
  const origin = `${scrubText(scheme)}${authority === undefined ? "" : `//${scrubHost(authority.slice(authority.lastIndexOf("@") + 1))}`}`;
  if (path.startsWith(STATIC_PATH) && safePath(path)) return `${origin}${path}`;
  const segments = path.split("/").map((segment) => (segment === "" || LITERAL_SEGMENTS.has(segment) ? segment : ID));
  return `${origin}${segments.join("/")}`;
}

/** The schemes of the build and of Node, a fixed list: any other is checked like the rest. */
const BUILD_SCHEME = /^(?:node:|(?:app|webpack-internal):\/\/)/i;
/** Paths of the build and of Node, after their scheme: they name code and never a person. */
const BUILD_PATH = /^\/_next\/|\/\.next\/|\/node_modules\//;

/**
 * A frame's file: a file of the build (`app:///_next/…`, `…/.next/…`, `…/node_modules/…`,
 * `node:…`) as it is, without query nor fragment; anything else, a page among them, through
 * `scrubUrl`. Never one with a space: the Node parser makes the file of a line of a message
 * out of the rest of that line, words and all.
 */
function scrubLocation(location: string): string {
  return buildFile(location) ?? scrubUrl(location);
}

function buildFile(location: unknown): string | undefined {
  const file = typeof location === "string" ? location.split(/[?#]/, 1)[0] : "";
  const path = file.replace(BUILD_SCHEME, "");
  const build = /^node:/i.test(file) || BUILD_PATH.test(path);
  return safePath(path) && build ? file : undefined;
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
 * An `http` span's name is the SDK's, a method and the URL of a request: `scrubRequestUrl`.
 */
export function scrubText(text: string, kind: "text" | "db" | "http" = "text"): string {
  let scrubbed = String(text);
  for (const quoted of kind === "db" ? OTHER_QUOTED : [DOUBLE_QUOTED, ...OTHER_QUOTED]) {
    scrubbed = scrubbed.replace(quoted, REDACTED);
  }
  return scrubbed.replace(IN_TEXT, (match: string, url?: string, run?: string, id?: string) => {
    if (url) return kind === "http" ? scrubRequestUrl(url) : scrubUrl(url);
    if (id) return KEPT_WORDS.has(id.toLowerCase()) ? id : REDACTED;
    if (run || digitCount(match) >= PHONE_DIGITS) return REDACTED;
    return match;
  });
}

function digitCount(text: string): number {
  return (text.match(/\d/g) ?? []).length;
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
        url: stringOr(data.url, scrubRequestUrl),
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
    event_id: stringOr(event.event_id, hex),
    timestamp: finite(event.timestamp),
    level: typeof event.level === "string" && LEVELS.has(event.level) ? event.level : undefined,
    platform: stringOr(event.platform, name),
    release: stringOr(event.release, name),
    dist: stringOr(event.dist, name),
    environment: stringOr(event.environment, name),
    sdk: event.sdk && scrubSdk(record(event.sdk)),
    transaction: stringOr(event.transaction, scrubText),
    message: stringOr(event.message, scrubText),
    logentry: event.logentry && compact({ message: stringOr(event.logentry.message, scrubText) }),
    exception: event.exception && { values: list(event.exception.values).map(scrubException) },
    request: event.request && scrubRequest(event.request, event.platform === "javascript"),
    breadcrumbs: event.breadcrumbs && list(event.breadcrumbs).map(scrubBreadcrumb).filter((b) => b !== null),
    contexts: event.contexts && scrubContexts(record(event.contexts)),
    debug_meta: event.debug_meta && {
      images: list(event.debug_meta.images).map((image) =>
        pick(record(image), { type: name, debug_id: name, code_file: scrubLocation }),
      ) as unknown as NonNullable<ErrorEvent["debug_meta"]>["images"],
    },
    sdkProcessingMetadata: Object.keys(dsc).length ? { dynamicSamplingContext: scrubDsc(dsc) } : undefined,
  });
}

/** The SDK's name, version, integrations and packages, each a name. */
function scrubSdk(sdk: Record<string, unknown>): ErrorEvent["sdk"] {
  const names = (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === "string").map(name) : undefined);
  return compact({
    ...pick(sdk, { name, version: name }),
    integrations: names(sdk.integrations),
    packages: Array.isArray(sdk.packages) ? sdk.packages.map((p) => pick(record(p), { name, version: name })) : undefined,
    settings: sdk.settings && pick(record(sdk.settings), { infer_ip: name }),
  }) as ErrorEvent["sdk"];
}

type Exception = NonNullable<NonNullable<ErrorEvent["exception"]>["values"]>[number];

function scrubException(exception: Exception): Exception {
  const mechanism = record(exception.mechanism);
  return compact({
    type: stringOr(exception.type, name),
    value: stringOr(exception.value, scrubText),
    mechanism: exception.mechanism && {
      type: stringOr(mechanism.type, name) ?? "generic",
      ...compact({
        handled: bool(mechanism.handled),
        synthetic: bool(mechanism.synthetic),
        source: stringOr(mechanism.source, name),
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
/*
 * A part of such a name that may still be a token, or an id with a digit in it. An id is
 * bounded as `scrubText` bounds it, by anything but a letter, a digit or `_`: a `$` next to
 * it (`$Ab3dEf7h`) does not hide it.
 */
const SECRET_PART = /(?<![\w$])[\w$]{22,}(?![\w$])|(?<!\w)(?=\w*\d)[2-9A-HJ-NP-Za-km-z]{8}(?!\w)/;

/**
 * A function's name as it is only in a frame of code, when it reads as one and holds no
 * secret's part: through `scrubText`, `onSubmit` would read as an id. The SDK's parsers make
 * a frame of any line of a message that looks like one, and its words become the name: a
 * name that does not read as one is not sent at all, since `scrubText` cannot tell a first
 * name from a word; outside a frame of code, every name goes through `scrubText`.
 */
function scrubFunctionName(name: string, code: boolean): string {
  if (!FUNCTION_NAME.test(name)) return REDACTED;
  return !code || SECRET_PART.test(name) ? scrubText(name) : name;
}

/**
 * A frame of code: a line number in a file of the build or of Node. A line of a message may
 * carry a line number (`at x (since 10:30)`), never such a file without a space in it.
 */
export function inCode(frame: StackFrame): boolean {
  return finite(frame.lineno) !== undefined && buildFile(frame.filename ?? frame.abs_path) !== undefined;
}

/** The files of the runtime's own frames, as the SDK's parsers write them, and as `allowUrls` skips them. */
export const RUNTIME_FILES: ReadonlySet<unknown> = new Set(["<anonymous>", "[native code]"]);

/** ECMAScript's own objects, a fixed list: `process`, `console`, a page's global or an element's id is none of them. */
const BUILT_INS = `Array ArrayBuffer Atomics BigInt Boolean DataView Date Error EvalError FinalizationRegistry Float32Array
  Float64Array Function Int8Array Int16Array Int32Array Intl Iterator JSON Map Math Number Object Promise Proxy RangeError
  ReferenceError Reflect RegExp Set SharedArrayBuffer String Symbol SyntaxError TypeError URIError Uint8Array
  Uint8ClampedArray Uint16Array Uint32Array WeakMap WeakRef WeakSet`.split(/\s+/);

/**
 * The names of each built-in's own members and of its prototype's, read once, when this
 * module loads: a member added since (`Object.prototype.Marc = …`) is none of them. A
 * built-in this runtime lacks is left out: in a page, an element's id could take its name.
 */
const MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  BUILT_INS.flatMap((name) => {
    const object = (globalThis as Record<string, unknown>)[name];
    const tag = Object.prototype.toString.call(object);
    if (typeof object !== "function" && tag !== `[object ${name}]`) return [];
    const each = [object as object, (object as { prototype?: object }).prototype].filter((part) => part !== undefined);
    return [[name, new Set(each.flatMap((part) => Object.getOwnPropertyNames(part)))] as const];
  }),
);
const ANY_MEMBER: ReadonlySet<string> = new Set([...MEMBERS.values()].flatMap((members) => [...members]));

/**
 * A built-in's name, as V8 (`JSON.parse`, `Array.map`, `new Promise`) or Safari (`parse`)
 * write it: each of its words one of the runtime's. A first name is none of them.
 */
function builtInName(name: string): boolean {
  const constructed = /^new (\w+)$/.exec(name);
  if (constructed) return MEMBERS.has(constructed[1]);
  const [owner, member, ...rest] = name.split(".");
  if (rest.length > 0) return false;
  if (member !== undefined) return MEMBERS.get(owner)?.has(member) === true;
  return MEMBERS.has(owner) || ANY_MEMBER.has(owner);
}

/**
 * A frame of the runtime (#395): `JSON.parse (<anonymous>)`, `parse@[native code]`. No line,
 * and a built-in's name: the SDK's parsers make `    at Marc (<anonymous>)` a frame too.
 */
export function inRuntime(frame: StackFrame): boolean {
  return frame.lineno === undefined && RUNTIME_FILES.has(frame.filename) && builtInName(frame.function ?? "");
}

/**
 * Where the code ran, and nothing it held: no `vars`, no lines of source. Line and column
 * only in a frame of code: from a line of a message (`tel:0647812953:1`), they are its digits.
 * A frame of the runtime as it is: its file is one of a fixed list, its name the runtime's.
 */
function scrubFrame(frame: StackFrame): StackFrame {
  if (inRuntime(frame)) return compact({ filename: frame.filename, function: frame.function, in_app: bool(frame.in_app) });
  const code = inCode(frame);
  return compact({
    filename: stringOr(frame.filename, scrubLocation),
    abs_path: stringOr(frame.abs_path, scrubLocation),
    module: stringOr(frame.module, scrubLocation),
    function: stringOr(frame.function, (fn) => scrubFunctionName(fn, code)),
    lineno: code ? finite(frame.lineno) : undefined,
    colno: code ? finite(frame.colno) : undefined,
    in_app: bool(frame.in_app),
  });
}

/** `{ method?, url }`, and the browser's `User-Agent`: no cookie, header, body, query or env. */
function scrubRequest(request: NonNullable<ErrorEvent["request"]>, browser: boolean): ErrorEvent["request"] {
  const userAgent = Object.entries(record(request.headers)).find(([name]) => name.toLowerCase() === "user-agent")?.[1];
  return compact({
    method: method(request.method),
    url: stringOr(request.url, scrubUrl),
    headers: browser && typeof userAgent === "string" ? { "User-Agent": scrubText(userAgent) } : undefined,
  });
}

/** System contexts, each value a name or scrubbed; `trace` without its `data`, `nextjs` with its paths scrubbed. */
const SYSTEM_CONTEXTS = ["app", "cloud_resource", "device", "os", "runtime"];

function scrubContexts(contexts: Record<string, unknown>): ErrorEvent["contexts"] {
  const kept: Record<string, Record<string, unknown>> = {};
  for (const context of SYSTEM_CONTEXTS) {
    if (!contexts[context]) continue;
    // The keys are the SDK's, and only the SDK writes them.
    const values = Object.entries(record(contexts[context])).map(([key, v]) => [key, typeof v === "string" ? name(v) : finite(v) ?? bool(v)]);
    kept[context] = compact(Object.fromEntries(values));
  }
  const { trace, nextjs, response } = contexts as Record<string, Record<string, unknown> | undefined>;
  const ids = { trace_id: hex, span_id: hex, parent_span_id: hex };
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
  const kept = { trace_id: hex, public_key: hex, sample_rate: name, release: name, environment: name, sampled: name };
  return pick(dsc, { ...kept, sample_rand: name, org_id: name, transaction: scrubText });
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
    // `type` and `unit` are the SDK's, and only the SDK writes them.
    return scrubbed === undefined ? undefined : compact({ value: scrubbed, type, unit });
  }
  const text = (each: (s: string) => string) =>
    Array.isArray(value) ? value.map((v) => (typeof v === "string" ? each(v) : v)) : typeof value === "string" ? each(value) : value;
  // A `sentry.*` key is the SDK's, and only the SDK writes it; its value is checked.
  if (key.startsWith("sentry.")) {
    if (DROPPED_SENTRY.test(key)) return undefined;
    return text(VERBATIM_ATTRIBUTES.has(key) ? name : scrubText);
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
  const http = (typeof op === "string" ? op : record(op).value) === "http.client";
  let name = REDACTED;
  try {
    name = scrubText(span.name, db ? "db" : http ? "http" : "text");
  } catch {
    // A name that cannot be read is sent as `[redacted]`.
  }
  return compact({
    trace_id: stringOr(span.trace_id, hex),
    parent_span_id: stringOr(span.parent_span_id, hex),
    span_id: stringOr(span.span_id, hex),
    name,
    // The timestamps are the SDK's, and only the SDK writes them.
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

function stringOr(value: unknown, scrub: (s: string) => string = (s) => s): string | undefined {
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
