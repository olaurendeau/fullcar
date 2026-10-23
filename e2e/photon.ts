/**
 * The slot's fake Photon (e2e/fake-photon.mjs), set from a test through its control port.
 * It is set by text, `q` exact, and keeps what it is told and what it receives for as long
 * as it runs: each test picks texts of its own (the app's cache keeps an answer an hour too).
 */

/** The properties of a Photon feature, as its API documents them and sends them. */
export type PhotonProperties = {
  osm_type?: string;
  osm_id?: number;
  osm_key?: string;
  osm_value?: string;
  /** The bounding box of a street or an area: `[minLon, maxLat, maxLon, minLat]`. */
  extent?: [number, number, number, number];
  name?: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  type?: string;
};

export type PhotonFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [lon: number, lat: number] };
  properties: PhotonProperties;
};

/**
 * What the fake answers to a text: its features (none by default), its status (200 by
 * default) and how long it waits before answering (none by default).
 */
export type PhotonAnswer = { features?: PhotonFeature[]; status?: number; delayMs?: number };

/** A request the fake received: its path, its query as sent, and its headers (lower case). */
export type PhotonRequest = { path: string; query: string; headers: Record<string, string | undefined> };

function controlUrl(path: string) {
  const base = process.env.PHOTON_CONTROL_URL;
  if (!base) throw new Error("e2e: PHOTON_CONTROL_URL is not set");
  return new URL(path, base);
}

/** A Photon feature at `lat`, `lon`, with the given properties. */
export function photonFeature({
  lat,
  lon,
  ...properties
}: PhotonProperties & { lat: number; lon: number }): PhotonFeature {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties };
}

/** From now on, the fake answers `answer` to the text `text`, and to it only. */
export async function answerFor(text: string, answer: PhotonAnswer): Promise<void> {
  const response = await fetch(controlUrl("/answers"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, answer }),
  });
  if (response.status !== 204) throw new Error(`e2e: the fake Photon refused the answer (${response.status})`);
}

/** The requests the fake received for the text `text`, oldest first. */
export async function requestsFor(text: string): Promise<PhotonRequest[]> {
  const url = controlUrl("/requests");
  url.searchParams.set("q", text);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`e2e: the fake Photon did not list its requests (${response.status})`);
  return response.json();
}
