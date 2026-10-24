import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

/*
 * #558, event-map v22: Leaflet's licence, BSD 2-Clause, asks a binary distribution to reproduce
 * its notice. The map shows no « Leaflet »: the notice is served by our origin, from the
 * production build `make e2e` serves, at /licences.txt. Read against the package installed,
 * its version included: an upgrade of Leaflet fails here until the notice follows it.
 */

/** Its line ends, whichever the file has. */
const lines = (text: string) => text.replace(/\r\n/g, "\n").trim();

const LICENSE = lines(readFileSync(new URL("../node_modules/leaflet/LICENSE", import.meta.url), "utf8"));
const VERSION: string = JSON.parse(readFileSync(new URL("../node_modules/leaflet/package.json", import.meta.url), "utf8")).version;

test("Leaflet's notice ships with the build: our origin serves its licence, whole, for the version installed", async ({ request }) => {
  const response = await request.get("/licences.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  const text = lines(await response.text());
  expect(LICENSE).toContain("BSD 2-Clause License");
  expect(text).toContain(LICENSE);
  expect(text).toContain(`Leaflet ${VERSION} (https://leafletjs.com)`);
});
