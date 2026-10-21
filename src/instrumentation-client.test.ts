import { afterEach, expect, it, vi } from "vitest";

/** The SDK's chunk does not load (network down, chunk blocked): starting Sentry rejects. */
const client = vi.hoisted(() => ({
  startBrowserSentry: vi.fn(async () => {
    throw new Error("Loading chunk failed");
  }),
}));
vi.mock("@/observability/client", () => ({ browserEnv: () => ({}), startBrowserSentry: client.startBrowserSentry }));

afterEach(() => {
  vi.unstubAllEnvs();
});

it("leaves a failed load of the SDK without an unhandled rejection, and navigations go on", async () => {
  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);
  try {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@o1.ingest.de.sentry.io/2");
    const { onRouterTransitionStart } = await import("./instrumentation-client");
    await vi.waitFor(() => expect(client.startBrowserSentry).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unhandled).not.toHaveBeenCalled();
    expect(() => onRouterTransitionStart("/", "push")).not.toThrow();
  } finally {
    process.off("unhandledRejection", unhandled);
  }
});
