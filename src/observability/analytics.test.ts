import { isDeepStrictEqual } from "node:util";
import type { ReactElement } from "react";
import { Analytics, type AnalyticsProps, type BeforeSendEvent } from "@vercel/analytics/next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebAnalytics } from "@/components/analytics/web-analytics";
import { drawSecrets, leakedKinds, NAMES, ORIGIN, PHONES, type Secrets } from "./test-secrets";

/*
 * What Vercel Web Analytics receives (#346): the route, never an event's id, a token or a
 * query. No assertion here prints a secret when it fails: leaks are checked with
 * `leakedKinds`, which names kinds, and exact values with `isDeepStrictEqual(…) === true`.
 */

let secrets: Secrets;
beforeEach(() => {
  secrets = drawSecrets();
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const leaks = (value: unknown) => leakedKinds(JSON.stringify(value) ?? "", secrets);
const same = (actual: unknown, expected: unknown) => expect(isDeepStrictEqual(actual, expected)).toBe(true);
const pageview = (url: string): BeforeSendEvent => ({ type: "pageview", url });

/** The element the root layout mounts. */
function mounted(): ReactElement<AnalyticsProps> | null {
  return WebAnalytics() as ReactElement<AnalyticsProps> | null;
}

/** What the script sends for `event`: what `beforeSend` returns, or the event itself without one. */
function sent(event: BeforeSendEvent): BeforeSendEvent | null {
  const element = mounted();
  if (!element) throw new Error("Web Analytics is not mounted");
  const { beforeSend } = element.props;
  return beforeSend ? beforeSend(event) : event;
}

describe("WebAnalytics", () => {
  it("mounts Vercel's component in production", () => {
    expect(mounted()?.type).toBe(Analytics);
  });

  it.each([["preview"], ["development"], [undefined]])("mounts nothing when the Vercel environment is %s", (environment) => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", environment);
    expect(mounted()).toBeNull();
  });

  it("sends the admin link as its route, without the event's id nor the token of its fragment", () => {
    const event = sent(pageview(secrets.adminUrl));
    expect(leaks(event)).toEqual([]);
    same(event, pageview(`${ORIGIN}/e/[id]/admin`));
  });

  it("sends each page as its route, without its query nor its fragment", () => {
    const { id, adminToken } = secrets;
    const query = `?token=${adminToken}&name=${encodeURIComponent(NAMES[0])}&phone=${encodeURIComponent(PHONES[0])}`;
    const routes = [
      ["/", "/"],
      ["/nouveau", "/nouveau"],
      [`/e/${id}`, "/e/[id]"],
      [`/e/${id}/admin`, "/e/[id]/admin"],
    ];
    for (const [path, route] of routes) {
      for (const url of [`${ORIGIN}${path}`, `${ORIGIN}${path}${query}`, `${ORIGIN}${path}#${adminToken}`, `${ORIGIN}${path}${query}#${adminToken}`]) {
        const event = sent(pageview(url));
        expect(leaks(event)).toEqual([]);
        same(event, pageview(`${ORIGIN}${route}`));
      }
    }
  });

  it("sends nothing for a path that is none of the application's routes", () => {
    const { id, personalToken } = secrets;
    for (const path of [`/e/${id}/moi#${personalToken}`, `/e/${id}/admin/x`, `/e/`, `/${id}`, `/nouveau/${id}`, "/monitoring", "/confidentialite", "/connexion", "/mes-evenements"]) {
      same(sent(pageview(`${ORIGIN}${path}`)), null);
    }
  });

  it("sends nothing for a URL it cannot read, nor for a custom event", () => {
    same(sent(pageview(`not a url ${secrets.adminToken}`)), null);
    same(sent({ type: "event", url: `${ORIGIN}/` }), null);
  });

  describe("on a browser without URL.canParse (Safari 16.4 to 16.x, Chrome 111 to 119)", () => {
    const canParse = Object.getOwnPropertyDescriptor(URL, "canParse");
    beforeEach(() => {
      Reflect.deleteProperty(URL, "canParse");
    });
    afterEach(() => {
      if (canParse) Object.defineProperty(URL, "canParse", canParse);
    });

    it("sends the admin link as its route, and nothing for a URL it cannot read", () => {
      expect(URL.canParse).toBeUndefined();
      const event = sent(pageview(secrets.adminUrl));
      expect(leaks(event)).toEqual([]);
      same(event, pageview(`${ORIGIN}/e/[id]/admin`));
      same(sent(pageview(`not a url ${secrets.adminToken}`)), null);
    });
  });
});
