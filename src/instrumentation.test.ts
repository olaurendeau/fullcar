import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestError, register } from "./instrumentation";

/** The SDK, replaced: its factory runs only if something imports it, once per file, so the tests without a DSN come first. */
const sdk = vi.hoisted(() => ({
  loads: 0,
  init: vi.fn(() => ({ on: vi.fn(), addEventProcessor: vi.fn() })),
  captureRequestError: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => {
  sdk.loads += 1;
  return { init: sdk.init, captureRequestError: sdk.captureRequestError, httpIntegration: () => ({ name: "Http" }) };
});

const request = { path: "/", method: "GET", headers: {} };
const context = { routerKind: "App Router", routePath: "/", routeType: "render", revalidateReason: undefined } as const;

beforeEach(() => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("src/instrumentation.ts", () => {
  it.each(["", " "])("imports no SDK without a DSN (%j), on start nor on a request's error", async (dsn) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", dsn);
    await register();
    await onRequestError(new Error("x"), request, context);
    expect(sdk.loads).toBe(0);
  });

  it("starts the SDK once with a DSN, and reports a request's error", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@o1.ingest.de.sentry.io/2");
    await register();
    await onRequestError(new Error("x"), request, context);
    expect([sdk.loads, sdk.init.mock.calls.length, sdk.captureRequestError.mock.calls.length]).toEqual([1, 1, 1]);
  });
});
