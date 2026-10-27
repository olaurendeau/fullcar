import type { Page } from "@playwright/test";
import { expect, leaveNoToken, test } from "./fixtures";
import { keepAdminToken, organiserPath } from "./organiser";

/*
 * #234: built without NEXT_PUBLIC_SENTRY_DSN, as the CI builds it, no page downloads the SDK,
 * and nothing leaves for Sentry or anyone else, even when the page fails. Only numbers are
 * compared: no assertion shows a URL, and the admin link is one.
 */

/** A string of the SDK's own code, in none of ours: a script that holds it is the SDK. */
const SDK_CODE = "sentry.javascript.";

leaveNoToken();

test.use({ locale: "fr-FR" });

/** An error thrown and a promise rejected, neither handled: what Sentry would report. */
async function failInThePage(page: Page, failures: { count: number }) {
  const before = failures.count;
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("sentry-off");
    });
    void Promise.reject(new Error("sentry-off"));
  });
  await expect.poll(() => failures.count - before).toBe(2);
  await page.waitForLoadState("networkidle");
}

test("without a DSN, no SDK and no request to Sentry or another origin, on the admin link and the public page", async ({
  page,
  seededEvent,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const sent = { elsewhere: 0, monitoring: 0 };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.origin !== origin) sent.elsewhere += 1;
    else if (url.pathname.startsWith("/monitoring")) sent.monitoring += 1;
  });
  const scripts: Promise<boolean>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    scripts.push(response.text().then((code) => code.includes(SDK_CODE), () => false));
  });
  const failures = { count: 0 };
  page.on("pageerror", () => {
    failures.count += 1;
  });
  const sentryIn = (page: Page) => page.evaluate(() => "__SENTRY__" in globalThis);

  await keepAdminToken(page, seededEvent.id, seededEvent.token);
  await page.goto(organiserPath(seededEvent));
  await expect(page.getByRole("region", { name: "Espace organisateur" })).toBeVisible();
  await failInThePage(page, failures);
  const onAdmin = await sentryIn(page);

  await page.goto(`/e/${seededEvent.id}`);
  await expect(page.getByRole("main")).toBeVisible();
  await failInThePage(page, failures);
  const onPublic = await sentryIn(page);

  const sdkScripts = (await Promise.all(scripts)).filter(Boolean).length;
  expect({ onAdmin, onPublic, sdkScripts }).toEqual({ onAdmin: false, onPublic: false, sdkScripts: 0 });
  expect(sent).toEqual({ elsewhere: 0, monitoring: 0 });
});
