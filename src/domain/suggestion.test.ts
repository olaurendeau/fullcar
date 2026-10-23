import { describe, expect, it } from "vitest";
import { cacheKey, photonQuery, placeQueryOf, suggestionsOf, type PlaceQuery } from "./suggestion";

const PHOTON = "https://photon.komoot.io/api/";

type Properties = Record<string, unknown>;

/** A Photon feature, in its GeoJSON: `coordinates` is `[lon, lat]`. */
function feature(properties: Properties, lon = 4.6894, lat = 45.7581) {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties };
}

function collection(...features: unknown[]) {
  return { type: "FeatureCollection", features };
}

/** The labels Photon's answer gives. */
function labelsOf(json: unknown) {
  return suggestionsOf(json)?.map((suggestion) => suggestion.label);
}

const FR = { country: "France", countrycode: "FR" };

describe("placeQueryOf", () => {
  it("reads the text trimmed, the locale and no near", () => {
    expect(placeQueryOf({ text: "  Brindas \n", locale: "fr" })).toEqual({
      value: { text: "Brindas", locale: "fr", near: null },
    });
  });

  it("reads a null near as no near", () => {
    expect(placeQueryOf({ text: "Brindas", locale: "en", near: null })).toEqual({
      value: { text: "Brindas", locale: "en", near: null },
    });
  });

  it("rounds near to 1 decimal: the event's exact position never reaches Photon", () => {
    expect(placeQueryOf({ text: "Brindas", locale: "fr", near: { lat: 45.7581, lng: 4.6894 } })).toEqual({
      value: { text: "Brindas", locale: "fr", near: { lat: 45.8, lng: 4.7 } },
    });
  });

  it("accepts 3 characters and 120, after trim, counted in code points", () => {
    expect(placeQueryOf({ text: " Bri ", locale: "fr" })).toEqual({ value: { text: "Bri", locale: "fr", near: null } });
    expect(placeQueryOf({ text: "\u{1f697}".repeat(3), locale: "fr" })).toEqual({
      value: { text: "\u{1f697}".repeat(3), locale: "fr", near: null },
    });
    expect(placeQueryOf({ text: "a".repeat(120), locale: "fr" })).toEqual({
      value: { text: "a".repeat(120), locale: "fr", near: null },
    });
  });

  it.each([
    ["a text of 2 characters after trim", { text: "  Br  ", locale: "fr" }],
    ["a text of 2 code points, 4 UTF-16 units", { text: "\u{1f697}\u{1f697}", locale: "fr" }],
    ["a text of 121 characters", { text: "a".repeat(121), locale: "fr" }],
    ["an empty text", { text: "   ", locale: "fr" }],
    ["no text", { locale: "fr" }],
    ["a text that is not a string", { text: 12345, locale: "fr" }],
    ["a text with a NUL character", { text: "Bri\u0000ndas", locale: "fr" }],
    ["a text with a lone surrogate, which encodeURIComponent cannot encode", { text: "Lyo\ud800n", locale: "fr" }],
    ["a text with a lone low surrogate", { text: "Lyon\udc00", locale: "fr" }],
    ["an unknown locale", { text: "Brindas", locale: "de" }],
    ["no locale", { text: "Brindas" }],
    ["a latitude out of bounds", { text: "Brindas", locale: "fr", near: { lat: 90.1, lng: 4.6894 } }],
    ["a longitude out of bounds", { text: "Brindas", locale: "fr", near: { lat: 45.7581, lng: -180.1 } }],
    ["a near that is not a position", { text: "Brindas", locale: "fr", near: "45.7581,4.6894" }],
    ["a body that is null", null],
    ["a body that is a string", "Brindas"],
    ["a body that is an array", ["Brindas", "fr"]],
  ])("refuses %s as invalid, without throwing", (_, body) => {
    expect(placeQueryOf(body)).toEqual({ error: "invalid" });
  });
});

describe("photonQuery", () => {
  it("asks for 5 results in the page's language, without lat or lon when there is no near", () => {
    expect(photonQuery(PHOTON, { text: "Brindas", locale: "fr", near: null })).toBe(
      "https://photon.komoot.io/api/?q=Brindas&limit=5&lang=fr",
    );
  });

  it("sends near as lat and lon (AL4.1)", () => {
    const query = placeQueryOf({ text: "Brindas", locale: "en", near: { lat: 45.7581, lng: 4.6894 } });
    expect("value" in query && photonQuery(PHOTON, query.value)).toBe(
      "https://photon.komoot.io/api/?q=Brindas&limit=5&lang=en&lat=45.8&lon=4.7",
    );
  });

  it("sends a negative near as it is", () => {
    expect(photonQuery(PHOTON, { text: "Sydney", locale: "en", near: { lat: -33.9, lng: -151.2 } })).toBe(
      "https://photon.komoot.io/api/?q=Sydney&limit=5&lang=en&lat=-33.9&lon=-151.2",
    );
  });

  it("encodes the text as one query value: spaces, &, =, #, + and accents", () => {
    expect(photonQuery(PHOTON, { text: "12 rue des Lilas & Co=#1+é", locale: "fr", near: null })).toBe(
      "https://photon.komoot.io/api/?q=12%20rue%20des%20Lilas%20%26%20Co%3D%231%2B%C3%A9&limit=5&lang=fr",
    );
  });

  it("starts from the base it is given", () => {
    expect(photonQuery("http://photon:2322/api/", { text: "Brindas", locale: "fr", near: null })).toBe(
      "http://photon:2322/api/?q=Brindas&limit=5&lang=fr",
    );
  });
});

describe("suggestionsOf: the label", () => {
  it("names a named place « {name}, {postcode} {city} », its address left out", () => {
    const gymnasium = feature({
      name: "Gymnase des Lilas",
      housenumber: "12",
      street: "Rue des Lilas",
      postcode: "35000",
      city: "Rennes",
      type: "house",
      ...FR,
    });
    expect(labelsOf(collection(gymnasium))).toEqual(["Gymnase des Lilas, 35000 Rennes"]);
  });

  it("names an address « {housenumber} {street}, {postcode} {city} »", () => {
    const address = feature({ housenumber: "12", street: "Rue des Lilas", postcode: "69126", city: "Brindas", type: "house", ...FR });
    expect(labelsOf(collection(address))).toEqual(["12 Rue des Lilas, 69126 Brindas"]);
  });

  it("names a street « {street}, {postcode} {city} », from its name", () => {
    const street = feature({ name: "Chemin de Vaugneray", postcode: "69290", city: "Craponne", type: "street", ...FR });
    expect(labelsOf(collection(street))).toEqual(["Chemin de Vaugneray, 69290 Craponne"]);
  });

  it("names a street from its name rather than its street", () => {
    const street = feature({ name: "Chemin de Vaugneray", street: "D 30", postcode: "69290", city: "Craponne", type: "street", ...FR });
    expect(labelsOf(collection(street))).toEqual(["Chemin de Vaugneray, 69290 Craponne"]);
  });

  it("names a street from its street when it has no name", () => {
    const street = feature({ street: "Chemin de Vaugneray", postcode: "69290", city: "Craponne", type: "street", ...FR });
    expect(labelsOf(collection(street))).toEqual(["Chemin de Vaugneray, 69290 Craponne"]);
  });

  it("names a city « {city} ({postcode}) »", () => {
    const city = feature({ name: "Brindas", postcode: "69126", county: "Rhône", state: "Auvergne-Rhône-Alpes", type: "city", ...FR });
    expect(labelsOf(collection(city))).toEqual(["Brindas (69126)"]);
  });

  it("names a city without a postcode « {city}, {county} », or its state without a county", () => {
    const withCounty = feature({ name: "Brindas", county: "Rhône", state: "Auvergne-Rhône-Alpes", type: "city", ...FR });
    const withState = feature({ name: "Vaugneray", state: "Auvergne-Rhône-Alpes", type: "city", ...FR });
    const alone = feature({ name: "Craponne", type: "city", ...FR });
    expect(labelsOf(collection(withCounty, withState, alone))).toEqual([
      "Brindas, Rhône",
      "Vaugneray, Auvergne-Rhône-Alpes",
      "Craponne",
    ]);
  });

  it("leaves out a missing postcode or city, and the comma before nothing", () => {
    const noPostcode = feature({ name: "Mairie", city: "Brindas", type: "house", ...FR });
    const noCity = feature({ name: "Mairie", postcode: "69126", type: "house", ...FR });
    const neither = feature({ name: "Mairie", type: "house", ...FR });
    expect(labelsOf(collection(noPostcode, noCity, neither))).toEqual(["Mairie, Brindas", "Mairie, 69126", "Mairie"]);
  });

  it("ends the label with the country outside France only, as Photon gives it in the page's language", () => {
    const sion = (country: string) =>
      feature({ name: "Salle polyvalente Marie-Curie", postcode: "1950", city: "Sion", type: "house", country, countrycode: "CH" });
    const brindas = feature({ name: "Mairie", postcode: "69126", city: "Brindas", type: "house", ...FR });
    // Photon is asked with `lang=fr`, then with `lang=en`.
    expect(labelsOf(collection(sion("Suisse"), brindas))).toEqual(["Salle polyvalente Marie-Curie, 1950 Sion, Suisse", "Mairie, 69126 Brindas"]);
    expect(labelsOf(collection(sion("Switzerland"), brindas))).toEqual([
      "Salle polyvalente Marie-Curie, 1950 Sion, Switzerland",
      "Mairie, 69126 Brindas",
    ]);
  });

  it("reads the country code whatever its case", () => {
    const brindas = feature({ name: "Mairie", postcode: "69126", city: "Brindas", type: "house", country: "France", countrycode: "fr" });
    const sion = feature({ name: "Mairie", postcode: "1950", city: "Sion", type: "house", country: "Suisse", countrycode: "ch" });
    expect(labelsOf(collection(brindas, sion))).toEqual(["Mairie, 69126 Brindas", "Mairie, 1950 Sion, Suisse"]);
  });

  it("without a country code, tells France by its name", () => {
    const brindas = feature({ name: "Mairie", postcode: "69126", city: "Brindas", type: "house", country: "France" });
    const geneva = feature({ name: "Mairie", city: "Genève", type: "house", country: "Suisse" });
    expect(labelsOf(collection(brindas, geneva))).toEqual(["Mairie, 69126 Brindas", "Mairie, Genève, Suisse"]);
  });

  it("ends the label with no country when Photon gives none", () => {
    const place = feature({ name: "Mairie", city: "Sion", type: "house" });
    expect(labelsOf(collection(place))).toEqual(["Mairie, Sion"]);
  });

  it("does not repeat a country that is the place itself", () => {
    const country = feature({ name: "Suisse", type: "country", country: "Suisse", countrycode: "CH" });
    expect(labelsOf(collection(country))).toEqual(["Suisse"]);
  });

  it("trims each property, and leaves out an empty one or one that is not text", () => {
    const place = feature({ name: "  Mairie ", postcode: "  ", city: 69126, type: "house", ...FR });
    expect(labelsOf(collection(place))).toEqual(["Mairie"]);
  });

  it.each([
    ["nothing to name", { postcode: "69126", city: "Brindas", type: "house", ...FR }],
    ["a street without a housenumber nor a name", { street: "Rue des Lilas", postcode: "69126", city: "Brindas", type: "house", ...FR }],
    ["a housenumber without a street", { housenumber: "12", postcode: "69126", city: "Brindas", type: "house", ...FR }],
    ["a city without a name", { city: "Brindas", postcode: "69126", type: "city", ...FR }],
    ["a street without a name nor a street", { postcode: "69126", city: "Brindas", type: "street", ...FR }],
  ])("leaves out a feature with %s", (_, properties) => {
    expect(labelsOf(collection(feature(properties)))).toEqual([]);
  });
});

describe("suggestionsOf: the list (AL1.4)", () => {
  it("does not show a label of more than 120 characters, and shows one of 120", () => {
    const of120 = "a".repeat(120 - ", 69126 Brindas".length);
    const of121 = `${of120}b`;
    const json = collection(
      feature({ name: of121, postcode: "69126", city: "Brindas", type: "house", ...FR }),
      feature({ name: of120, postcode: "69126", city: "Brindas", type: "house", ...FR }),
    );
    expect(labelsOf(json)).toEqual([`${of120}, 69126 Brindas`]);
  });

  it("counts a label's length in code points", () => {
    const name = "\u{1f697}".repeat(120 - ", 69126 Brindas".length);
    expect(labelsOf(collection(feature({ name, postcode: "69126", city: "Brindas", type: "house", ...FR })))).toEqual([
      `${name}, 69126 Brindas`,
    ]);
  });

  it("makes one suggestion of two identical labels, the first", () => {
    const json = collection(
      feature({ name: "Mairie", postcode: "69126", city: "Brindas", type: "house", ...FR }, 4.69, 45.75),
      feature({ name: "Salle des fêtes", postcode: "69126", city: "Brindas", type: "house", ...FR }),
      feature({ name: "Mairie", postcode: "69126", city: "Brindas", type: "house", ...FR }, 4.7, 45.76),
    );
    expect(suggestionsOf(json)).toEqual([
      { label: "Mairie, 69126 Brindas", lat: 45.75, lng: 4.69 },
      { label: "Salle des fêtes, 69126 Brindas", lat: 45.7581, lng: 4.6894 },
    ]);
  });

  it("keeps 5 suggestions at most, the first ones", () => {
    const json = collection(
      ...["Mairie", "École", "Gare", "Salle des fêtes", "Gymnase", "Stade"].map((name) =>
        feature({ name, postcode: "69126", city: "Brindas", type: "house", ...FR }),
      ),
    );
    expect(labelsOf(json)).toEqual(["Mairie, 69126 Brindas", "École, 69126 Brindas", "Gare, 69126 Brindas", "Salle des fêtes, 69126 Brindas", "Gymnase, 69126 Brindas"]);
  });

  it("keeps 5 once the others are left out", () => {
    const json = collection(
      feature({ name: "a".repeat(121), type: "house", ...FR }),
      feature({ postcode: "69126", type: "house", ...FR }),
      ...["Mairie", "École", "Gare", "Salle des fêtes", "Gymnase"].map((name) => feature({ name, type: "house", ...FR })),
    );
    expect(labelsOf(json)).toEqual(["Mairie", "École", "Gare", "Salle des fêtes", "Gymnase"]);
  });

  it("reads [lon, lat] in that order, rounded to 5 decimals", () => {
    const json = collection(feature({ name: "Gymnase des Lilas", city: "Rennes", type: "house", ...FR }, -1.680024, 48.111986));
    expect(suggestionsOf(json)).toEqual([{ label: "Gymnase des Lilas, Rennes", lat: 48.11199, lng: -1.68002 }]);
  });

  it.each([
    ["no geometry", { type: "Feature", properties: { name: "Mairie" } }],
    ["no coordinates", { type: "Feature", geometry: { type: "Point" }, properties: { name: "Mairie" } }],
    [
      "coordinates that are not a list",
      { type: "Feature", geometry: { type: "Point", coordinates: { 0: 4.6894, 1: 45.7581 } }, properties: { name: "Mairie" } },
    ],
    ["one coordinate",{ type: "Feature", geometry: { type: "Point", coordinates: [4.6894] }, properties: { name: "Mairie" } }],
    ["a latitude out of bounds", feature({ name: "Mairie" }, 4.6894, 91)],
    ["a coordinate that is not a number", feature({ name: "Mairie" }, Number.NaN, 45.7581)],
    ["no properties", { type: "Feature", geometry: { type: "Point", coordinates: [4.6894, 45.7581] } }],
    ["a feature that is not an object", "Mairie"],
    ["a feature that is null", null],
  ])("leaves out a feature with %s, and keeps the others", (_, broken) => {
    const json = collection(broken, feature({ name: "Gare", type: "house", ...FR }));
    expect(labelsOf(json)).toEqual(["Gare"]);
  });

  it("reads no features as no suggestion", () => {
    expect(suggestionsOf(collection())).toEqual([]);
  });

  it.each([
    ["null", null],
    ["text", "<html>"],
    ["an object without features", { type: "FeatureCollection" }],
    ["features that are not a list", { type: "FeatureCollection", features: {} }],
  ])("reads an answer that is %s as unreadable: null, not an empty list", (_, json) => {
    expect(suggestionsOf(json)).toBeNull();
  });
});

describe("cacheKey", () => {
  const brindas: PlaceQuery = { text: "Salle des fêtes Brindas", locale: "fr", near: null };

  it("is the same for a text that differs only by case and spaces", () => {
    expect(cacheKey({ ...brindas, text: "SALLE  des\tFêtes   brindas" })).toBe(cacheKey(brindas));
  });

  it("differs for another text", () => {
    expect(cacheKey({ ...brindas, text: "Salle des fêtes Craponne" })).not.toBe(cacheKey(brindas));
    expect(cacheKey({ ...brindas, text: "Salle desfêtes Brindas" })).not.toBe(cacheKey(brindas));
  });

  it("differs for another language", () => {
    expect(cacheKey({ ...brindas, locale: "en" })).not.toBe(cacheKey(brindas));
  });

  it("differs with a near, and for another near, on each coordinate", () => {
    const near = cacheKey({ ...brindas, near: { lat: 45.8, lng: 4.7 } });
    expect(near).not.toBe(cacheKey(brindas));
    expect(cacheKey({ ...brindas, near: { lat: 45.9, lng: 4.7 } })).not.toBe(near);
    expect(cacheKey({ ...brindas, near: { lat: 45.8, lng: 4.8 } })).not.toBe(near);
  });

  it("is the same for two events' positions that round to the same near", () => {
    const one = placeQueryOf({ text: "Brindas", locale: "fr", near: { lat: 45.7581, lng: 4.6894 } });
    const other = placeQueryOf({ text: "brindas", locale: "fr", near: { lat: 45.7634, lng: 4.7012 } });
    expect("value" in one && "value" in other && cacheKey(one.value) === cacheKey(other.value)).toBe(true);
  });

  it("tells a latitude from a longitude", () => {
    expect(cacheKey({ ...brindas, near: { lat: 1, lng: 2 } })).not.toBe(cacheKey({ ...brindas, near: { lat: 2, lng: 1 } }));
  });

  it("tells no near from a near at 0, 0", () => {
    expect(cacheKey({ ...brindas, near: { lat: 0, lng: 0 } })).not.toBe(cacheKey(brindas));
  });
});
