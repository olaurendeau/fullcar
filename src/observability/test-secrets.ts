import { randomBytes } from "node:crypto";
import type { ErrorEvent } from "@sentry/nextjs";
import { organiserLinks } from "@/app/e/[id]/admin/admin-link";
import { newAdminToken } from "@/domain/admin-token";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";
import { generatePublicId, type RandomBytes } from "@/domain/public-id";

/*
 * What must never reach Sentry, drawn by the application's own builders, and the one way a
 * test looks for it: `leakedKinds` names what it finds, never the value, so that a failing
 * assertion prints no secret.
 */

export const ORIGIN = "https://fullcar.example";

/** Rare first names: letters a scrubber written for ASCII would let through. */
export const NAMES = ["Maëlys", "N'Golo", "Øyvind", "Ðorđe", "Siân", "Nguyễn Thị Ánh"];

/** The same numbers written the ways people type them. */
export const PHONES = [
  "06 47 81 29 53",
  "0739518264",
  "+33 6 58 14 92 37",
  "+33 (0)7.62.91.84.35",
  "06-93-27-15-48",
  "+1 (415) 555-0134",
  "+44 20 7946 0958",
  "06/21/73/48/95",
  "07_38_26_91_47",
];

/** A release as Vercel gives it, a commit SHA: kept as is, so it must not look like a phone. */
export const RELEASE = "4f1e9c2ab7d3e8f05c6a9b1d2e3f4a5b6c7d8e9f";

export type Secrets = ReturnType<typeof drawSecrets>;

/** Bytes that `generatePublicId` maps to lowercase letters only (symbols 32 to 56). */
export const lowercaseBytes = (size: number) => Uint8Array.from({ length: size }, (_, at) => 32 + ((at * 7) % 25));

export function drawSecrets(random?: RandomBytes) {
  const id = generatePublicId(random);
  const adminToken = newAdminToken();
  const personalToken = personalTokenFromBytes(new Uint8Array(randomBytes(PERSONAL_TOKEN_BYTES)));
  const { publicUrl, adminUrl } = organiserLinks(ORIGIN, id, adminToken);
  return { id, adminToken, personalToken, publicUrl, adminUrl, personalUrl: `${publicUrl}/moi#${personalToken}` };
}

/** The body of a server action that adds a person: `[id, token, { firstName, phone }]`. */
export function actionBody(secrets: Secrets, firstName = NAMES[0], phone = PHONES[0]): string {
  return JSON.stringify([secrets.id, secrets.personalToken, { firstName, phone }]);
}

export const USER_AGENT = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36";
export const STATIC_FRAME = `${ORIGIN}/_next/static/chunks/app/e/page-3f9ac2.js?dpl=dpl_8Hn2kQ`;
export const TRACE_ID = "1e0b944204cd40f8a6d7baf905604927";

/**
 * An error event as the SDK builds it with everything collected: a failed server action on
 * the admin link, every secret in every place the SDK may put one.
 */
export function leakyEvent(secrets: Secrets, platform: "javascript" | "node" = "javascript"): ErrorEvent {
  const { id, adminUrl, adminToken, personalToken } = secrets;
  return {
    type: undefined,
    event_id: "989a92cbfbf54007b4e829958f65a6d5",
    timestamp: 1792477108.151,
    platform,
    level: "error",
    release: RELEASE,
    environment: "production",
    server_name: `${NAMES[0]}-laptop`,
    transaction: `/e/${id}/admin`,
    message: `Seat taken by '${NAMES[1]}', call ${PHONES[1]}`,
    user: { id: personalToken, username: NAMES[0], ip_address: "203.0.113.7" },
    extra: { body: actionBody(secrets) },
    tags: { person: NAMES[1], phone: PHONES[1] },
    fingerprint: [adminUrl],
    contexts: {
      culture: { locale: "fr-FR", timezone: "Europe/Paris" },
      react: { version: "19.3.0" },
      os: { name: "Android", version: "15" },
      trace: { trace_id: TRACE_ID, span_id: "80751a90a011d3f8", op: "http.client", data: { "url.full": adminUrl } },
      nextjs: { request_path: `/e/${id}/admin`, router_kind: "App Router", router_path: "/e/[id]/admin", route_type: "action" },
      state: { state: { type: "redux", value: { firstName: NAMES[2], phone: PHONES[2] } } },
    },
    request: {
      method: "POST",
      url: adminUrl,
      headers: { "User-Agent": USER_AGENT, Referer: secrets.personalUrl, Cookie: `token=${personalToken}`, "Next-Action": "7f3a9c1e" },
      cookies: { NEXT_LOCALE: "fr", token: personalToken },
      data: actionBody(secrets, NAMES[3], PHONES[2]),
      query_string: `token=${adminToken}`,
      env: { REMOTE_ADDR: "203.0.113.7" },
    },
    exception: {
      values: [
        {
          type: "Error",
          value: `Could not seat "${NAMES[4]}" (${PHONES[3]}) from ${adminUrl}`,
          mechanism: { type: "auto.browser.global_handlers.onerror", handled: false, data: { url: adminUrl } },
          stacktrace: {
            frames: [
              { filename: STATIC_FRAME, function: "onSubmit", lineno: 1, colno: 4410, in_app: true },
              { filename: adminUrl, abs_path: adminUrl, function: "?", lineno: 12, colno: 7, in_app: true, vars: { NAMES, PHONES }, context_line: personalToken },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      { category: "console", level: "log", message: `${NAMES[0]} ${PHONES[5]}` },
      { category: "ui.click", message: `button[aria-label="${NAMES[1]}"]` },
      { category: "fetch", type: "http", data: { method: "POST", url: `/e/${id}/admin#${adminToken}`, status_code: 200 } },
    ],
    sdkProcessingMetadata: { dynamicSamplingContext: { trace_id: TRACE_ID, public_key: "public", release: RELEASE, transaction: adminUrl } },
  };
}

const digits = (text: string) => text.replace(/\D/g, "");

/** The kinds of secret found in `text`, by name only: `[]` when nothing leaked. */
export function leakedKinds(text: string, secrets: Secrets): string[] {
  const lower = text.toLowerCase();
  // Digits joined across the separators a phone number is written with.
  const joined = text.replace(/[\s.()+/_-]/g, "");
  const found = new Set<string>();
  if (text.includes(secrets.id)) found.add("event id");
  if (text.includes(secrets.adminToken)) found.add("admin token");
  if (text.includes(secrets.personalToken)) found.add("personal token");
  if (text.includes(secrets.adminUrl)) found.add("admin link");
  if (text.includes(secrets.personalUrl)) found.add("personal link");
  for (const phone of PHONES) {
    if (text.includes(phone) || joined.includes(digits(phone).slice(-8))) found.add("phone");
  }
  for (const name of NAMES) {
    if (lower.includes(name.toLowerCase()) || text.includes(encodeURIComponent(name))) found.add("name");
  }
  return [...found].sort();
}
