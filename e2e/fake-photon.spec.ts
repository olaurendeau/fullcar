import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import { answerFor, photonFeature, requestsFor } from "./photon";

// The fake Photon itself, as the app will reach it: `PHOTON_URL` of `web` (compose.yaml).
const PHOTON_URL = "http://photon:2322/api/";

/** A text of this test's own: the fake keeps its answers and requests for its whole life. */
function textOf(label: string) {
  return `${label} ${randomUUID()}`;
}

function search(q: string, headers: Record<string, string> = {}) {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "fr");
  return fetch(url, { headers });
}

const lilas = photonFeature({
  lat: 48.11198,
  lon: -1.68002,
  name: "Gymnase des Lilas",
  housenumber: "12",
  street: "Rue des Lilas",
  postcode: "35000",
  city: "Rennes",
  county: "Ille-et-Vilaine",
  state: "Bretagne",
  country: "France",
  countrycode: "FR",
  type: "house",
});

test.describe("the fake Photon", () => {
  test("answers an empty FeatureCollection to a text nobody set", async () => {
    const response = await search(textOf("Nulle part"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({ type: "FeatureCollection", features: [] });
  });

  test("serves the features set for a text, in Photon's GeoJSON, and only for that exact text", async () => {
    const text = textOf("Gymnase");
    await answerFor(text, { features: [lilas] });

    const response = await search(text);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-1.68002, 48.11198] },
          properties: {
            name: "Gymnase des Lilas",
            housenumber: "12",
            street: "Rue des Lilas",
            postcode: "35000",
            city: "Rennes",
            county: "Ille-et-Vilaine",
            state: "Bretagne",
            country: "France",
            countrycode: "FR",
            type: "house",
          },
        },
      ],
    });

    // `q` exact: neither another case, nor surrounding spaces, nor a prefix.
    for (const other of [text.toUpperCase(), ` ${text} `, text.slice(0, -1), textOf("Gymnase")]) {
      expect(await (await search(other)).json(), other).toEqual({ type: "FeatureCollection", features: [] });
    }
  });

  test("answers only on Photon's path", async () => {
    const text = textOf("Ailleurs");
    await answerFor(text, { features: [lilas] });
    const url = new URL("/reverse", PHOTON_URL);
    url.searchParams.set("q", text);
    expect((await fetch(url)).status).toBe(404);
  });

  for (const status of [500, 429]) {
    test(`answers the status ${status} set for a text`, async () => {
      const text = textOf(`Statut ${status}`);
      await answerFor(text, { status });
      expect((await search(text)).status).toBe(status);
      expect((await search(textOf("Voisin"))).status).toBe(200);
    });
  }

  test("answers after the delay set for a text, and the others at once", async () => {
    const text = textOf("Lent");
    await answerFor(text, { delayMs: 1500, features: [lilas] });

    const started = Date.now();
    const response = await search(text);
    const body = await response.json();
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(1500);
    expect(elapsed).toBeLessThan(3000);
    expect(body.features).toHaveLength(1);

    const other = Date.now();
    await search(textOf("Rapide"));
    expect(Date.now() - other).toBeLessThan(1000);
  });

  test("records each request for a text: its path, its query and its headers", async () => {
    const text = textOf("12, rue des Lilas, Créteil");
    expect(await requestsFor(text)).toEqual([]);

    await search(text, { "User-Agent": "fullcar/0.0.0 (+https://github.com/olaurendeau/fullcar)", Accept: "application/json" });
    await search(text, { "X-Second": "yes" });
    await search(textOf("Autre"));

    const requests = await requestsFor(text);
    expect(requests).toHaveLength(2);
    const [first, second] = requests;
    expect(first.path).toBe("/api/");
    // As sent, not decoded: the app's encoding of the text is what a test will check.
    expect(first.query).toBe(`q=${encodeQ(text)}&limit=5&lang=fr`);
    expect(first.headers["user-agent"]).toBe("fullcar/0.0.0 (+https://github.com/olaurendeau/fullcar)");
    expect(first.headers.accept).toBe("application/json");
    expect(first.headers["x-second"]).toBeUndefined();
    expect(second.headers["x-second"]).toBe("yes");
  });

  test("refuses a delay longer than a timer holds, which Node would cut to 1 ms", async () => {
    const text = textOf("Jamais");
    await expect(answerFor(text, { delayMs: 2 ** 31, features: [lilas] })).rejects.toThrow();

    // Nothing was set: the text is answered at once, empty.
    const started = Date.now();
    expect(await (await search(text)).json()).toEqual({ type: "FeatureCollection", features: [] });
    expect(Date.now() - started).toBeLessThan(1000);
    // The longest a timer holds is still a delay.
    await answerFor(textOf("Presque jamais"), { delayMs: 2 ** 31 - 1 });
  });

  test("records a request that is still waiting for its delay", async () => {
    const text = textOf("En attente");
    await answerFor(text, { delayMs: 1500 });
    const pending = search(text);
    await expect.poll(async () => (await requestsFor(text)).length, { timeout: 1000 }).toBe(1);
    await pending;
  });
});

/** `q` as URLSearchParams writes it: spaces as `+`. */
function encodeQ(text: string) {
  return new URLSearchParams({ q: text }).toString().slice("q=".length);
}
