/**
 * `POST /api/lieux` (place-autocomplete, « La route et Photon »): the text in the JSON body,
 * never in a URL; our own pages only; Photon asked with the query alone, never with anything of
 * the visitor's request. Nothing here is logged: the body holds what the person typed.
 */
import { placeQueryOf } from "@/domain/suggestion";
import type { Photon } from "./photon";

/** `{ text, locale, near }` takes about 200 bytes: beyond 1 024, it is not one of our pages'. */
const MAX_BODY = 1024;

const HEADERS = { "Cache-Control": "no-store" };

function answer(status: number, body?: unknown): Response {
  return body === undefined ? new Response(null, { status, headers: HEADERS }) : Response.json(body, { status, headers: HEADERS });
}

const INVALID = () => answer(400, { state: "invalid" });

/**
 * The rule Next applies to its server actions: the host of `Origin` is the one the request was
 * sent to, `x-forwarded-host` behind a proxy (Vercel), otherwise `Host`. No `Origin`, an opaque
 * one or no host to compare with: not one of our pages.
 */
function fromOurOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0].trim().toLowerCase();
  if (!origin || !host || !URL.canParse(origin)) return false;
  return new URL(origin).host === host;
}

/** The body as text, or `undefined` beyond `MAX_BODY` bytes or when it is not UTF-8. */
async function bodyOf(request: Request): Promise<string | undefined> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return undefined;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      void reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(value);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return undefined;
  }
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** 403 from elsewhere, 400 `invalid` for a body that is not a query, else 200 with Photon's answer. */
export async function handlePlaces(request: Request, photon: Photon): Promise<Response> {
  if (!fromOurOrigin(request.headers)) return answer(403);
  const text = await bodyOf(request).catch(() => undefined);
  if (text === undefined) return INVALID();
  const query = placeQueryOf(parsed(text));
  if ("error" in query) return INVALID();
  return answer(200, await photon.search(query.value));
}
