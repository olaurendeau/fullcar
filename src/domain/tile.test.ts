import { describe, expect, it } from "vitest";
import { isNotFoundReport, PLAN_IGN_UPDATED, tileOf, wmtsTileUrl } from "./tile";

describe("tileOf", () => {
  it("reads three canonical decimals inside the grid as a tile", () => {
    expect(tileOf({ z: "14", x: "8299", y: "5636" })).toEqual({ z: 14, x: 8299, y: 5636 });
  });

  it("accepts z from 0 to 18", () => {
    expect(tileOf({ z: "0", x: "0", y: "0" })).toEqual({ z: 0, x: 0, y: 0 });
    expect(tileOf({ z: "18", x: "0", y: "0" })).toEqual({ z: 18, x: 0, y: 0 });
  });

  it.each([
    ["−1", "-1"],
    ["19, past the last zoom", "19"],
    ["a decimal", "1.5"],
    ["a leading zero", "01"],
    ["a plus sign", "+1"],
    ["nothing", ""],
    ["a space around it", " 1"],
    ["an exponent", "1e1"],
    ["hexadecimal", "0x1"],
    ["a word", "z"],
  ])("refuses a z of %s", (_, z) => {
    expect(tileOf({ z, x: "0", y: "0" })).toBeNull();
  });

  it.each([
    ["a decimal", "1.5"],
    ["a leading zero", "01"],
    ["a plus sign", "+1"],
    ["a minus sign", "-1"],
    ["nothing", ""],
  ])("refuses an x or a y of %s", (_, value) => {
    expect(tileOf({ z: "14", x: value, y: "0" })).toBeNull();
    expect(tileOf({ z: "14", x: "0", y: value })).toBeNull();
  });

  it.each([0, 1, 14, 18])("at z %i, accepts x and y at 2^z − 1 and refuses them at 2^z", (z) => {
    const last = String(2 ** z - 1);
    const past = String(2 ** z);
    expect(tileOf({ z: String(z), x: last, y: last })).toEqual({ z, x: 2 ** z - 1, y: 2 ** z - 1 });
    expect(tileOf({ z: String(z), x: past, y: "0" })).toBeNull();
    expect(tileOf({ z: String(z), x: "0", y: past })).toBeNull();
  });

  it("refuses a number too large to be exact", () => {
    expect(tileOf({ z: "18", x: "99999999999999999999", y: "0" })).toBeNull();
  });
});

describe("wmtsTileUrl", () => {
  it("is the KVP GetTile of Plan IGN v2, normal style, grid PM_0_19, PNG", () => {
    expect(wmtsTileUrl("https://data.geopf.fr/wmts", { z: 14, x: 8299, y: 5636 })).toBe(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile" +
        "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png" +
        "&TILEMATRIXSET=PM_0_19&TILEMATRIX=14&TILEROW=5636&TILECOL=8299",
    );
  });

  it("puts the row from y and the column from x", () => {
    const params = new URL(wmtsTileUrl("https://data.geopf.fr/wmts", { z: 1, x: 0, y: 1 })).searchParams;
    expect([params.get("TILEMATRIX"), params.get("TILEROW"), params.get("TILECOL")]).toEqual(["1", "1", "0"]);
  });

  it("keeps the base's host, port and path, as the slot's fake IGN has them", () => {
    expect(wmtsTileUrl("http://ign:2324/wmts", { z: 0, x: 0, y: 0 })).toBe(
      "http://ign:2324/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile" +
        "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png" +
        "&TILEMATRIXSET=PM_0_19&TILEMATRIX=0&TILEROW=0&TILECOL=0",
    );
  });

  it("replaces a query or a fragment the base would carry: the GetTile query is the whole query", () => {
    const url = wmtsTileUrl("https://data.geopf.fr/wmts?LAYER=OTHER#here", { z: 0, x: 0, y: 0 });
    expect(new URL(url).searchParams.getAll("LAYER")).toEqual(["GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2"]);
    expect(url).not.toContain("#");
  });
});

/** The body the real service answered for every missing tile (#238, relevé de #473), byte for byte. */
const RELEVE =
  '<ExceptionReport xmlns="http://www.opengis.net/ows/1.1"><Exception exceptionCode="Not Found" >No data found</Exception></ExceptionReport>';

const OWS = "http://www.opengis.net/ows/1.1";

describe("isNotFoundReport", () => {
  it("is true for the body the real service answers", () => {
    expect(isNotFoundReport(RELEVE)).toBe(true);
  });

  it.each([
    ["an XML prologue", `<?xml version="1.0" encoding="UTF-8"?>\n${RELEVE}`],
    [
      "line breaks and indentation",
      `<ExceptionReport\n  xmlns="${OWS}"\n  version="1.1.0">\n  <Exception\n    exceptionCode="Not Found">\n    No data found\n  </Exception>\n</ExceptionReport>\n`,
    ],
    ["single quotes around the attribute", `<ExceptionReport xmlns='${OWS}'><Exception exceptionCode='Not Found'/></ExceptionReport>`],
    [
      "the ows: prefix",
      `<ows:ExceptionReport xmlns:ows="${OWS}"><ows:Exception exceptionCode="Not Found">No data found</ows:Exception></ows:ExceptionReport>`,
    ],
    [
      "a second Exception before it",
      `<ExceptionReport xmlns="${OWS}"><Exception exceptionCode="InvalidParameterValue" locator="TILEROW"/><Exception exceptionCode="Not Found">No data found</Exception></ExceptionReport>`,
    ],
    [
      "a second Exception after it",
      `<ExceptionReport xmlns="${OWS}"><Exception exceptionCode="Not Found"/><Exception exceptionCode="NoApplicableCode"/></ExceptionReport>`,
    ],
    ["a comment before it", `<!-- report -->${RELEVE}`],
    [
      "the prefix declared on the report and the default namespace elsewhere",
      `<ows:ExceptionReport xmlns:ows="${OWS}" xmlns="urn:other"><ows:Exception exceptionCode="Not Found"/></ows:ExceptionReport>`,
    ],
    [
      "the Exception's text in a CDATA section",
      `<ExceptionReport xmlns="${OWS}"><Exception exceptionCode="Not Found"><![CDATA[No <data> found]]></Exception></ExceptionReport>`,
    ],
    [
      "a character reference in the attribute",
      `<ExceptionReport xmlns="${OWS}"><Exception exceptionCode="Not&#32;Found"/></ExceptionReport>`,
    ],
  ])("is true with %s", (_, text) => {
    expect(isNotFoundReport(text)).toBe(true);
  });

  it.each([
    ["InvalidParameterValue", RELEVE.replace('"Not Found"', '"InvalidParameterValue"')],
    ["NotFound", RELEVE.replace('"Not Found"', '"NotFound"')],
    ["not found", RELEVE.replace('"Not Found"', '"not found"')],
    ["Not Found with a space after it", RELEVE.replace('"Not Found"', '"Not Found "')],
    ["empty", RELEVE.replace('"Not Found"', '""')],
  ])("is false for exceptionCode %s", (_, text) => {
    expect(isNotFoundReport(text)).toBe(false);
  });

  it.each([
    [
      "in the text of the Exception",
      `<ExceptionReport xmlns="${OWS}"><Exception exceptionCode="NoApplicableCode">Not Found</Exception></ExceptionReport>`,
    ],
    [
      "in a comment",
      `<ExceptionReport xmlns="${OWS}"><!-- <Exception exceptionCode="Not Found"/> --><Exception exceptionCode="NoApplicableCode"/></ExceptionReport>`,
    ],
    [
      "in a CDATA section",
      `<ExceptionReport xmlns="${OWS}"><Exception exceptionCode="NoApplicableCode"><![CDATA[<Exception exceptionCode="Not Found"/>]]></Exception></ExceptionReport>`,
    ],
    ["on another attribute", `<ExceptionReport xmlns="${OWS}"><Exception locator="Not Found" exceptionCode="NoApplicableCode"/></ExceptionReport>`],
    ["on an attribute in a namespace", `<ows:ExceptionReport xmlns:ows="${OWS}"><ows:Exception ows:exceptionCode="Not Found"/></ows:ExceptionReport>`],
    ["on another element", `<ExceptionReport xmlns="${OWS}"><Other exceptionCode="Not Found"/></ExceptionReport>`],
    ["on the report itself", `<ExceptionReport xmlns="${OWS}" exceptionCode="Not Found"/>`],
    [
      "on an Exception nested in another element",
      `<ExceptionReport xmlns="${OWS}"><Wrapper><Exception exceptionCode="Not Found"/></Wrapper></ExceptionReport>`,
    ],
    ["on an Exception that is the root", `<Exception xmlns="${OWS}" exceptionCode="Not Found"/>`],
    ["on an Exception under another OWS root", `<Report xmlns="${OWS}"><Exception exceptionCode="Not Found"/></Report>`],
  ])("is false with « Not Found » %s", (_, text) => {
    expect(isNotFoundReport(text)).toBe(false);
  });

  it.each([
    ["OWS 1.0", RELEVE.replace(OWS, "http://www.opengis.net/ows")],
    ["OGC's service exceptions", RELEVE.replace(OWS, "http://www.opengis.net/ogc")],
    ["no namespace", RELEVE.replace(` xmlns="${OWS}"`, "")],
    [
      "the Exception in another namespace than the report",
      `<ExceptionReport xmlns="${OWS}"><Exception xmlns="urn:other" exceptionCode="Not Found"/></ExceptionReport>`,
    ],
    [
      "the report in another namespace than the Exception",
      `<ExceptionReport xmlns="urn:other"><Exception xmlns="${OWS}" exceptionCode="Not Found"/></ExceptionReport>`,
    ],
    [
      "the default namespace undeclared on the Exception",
      `<ExceptionReport xmlns="${OWS}"><Exception xmlns="" exceptionCode="Not Found"/></ExceptionReport>`,
    ],
    [
      "the OWS namespace under a prefix the elements do not use",
      `<ExceptionReport xmlns:ows="${OWS}"><Exception exceptionCode="Not Found"/></ExceptionReport>`,
    ],
    ["an undeclared prefix", `<ows:ExceptionReport><ows:Exception exceptionCode="Not Found"/></ows:ExceptionReport>`],
    ["an undeclared prefix on another element", `<ExceptionReport xmlns="${OWS}"><foo:Other/><Exception exceptionCode="Not Found"/></ExceptionReport>`],
  ])("is false in %s", (_, text) => {
    expect(isNotFoundReport(text)).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "  \n"],
    ["plain text", "Not Found"],
    ["JSON", '{"exceptionCode":"Not Found"}'],
    ["an HTML page", "<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>"],
    ["cut inside the Exception's text", RELEVE.slice(0, RELEVE.indexOf("No data") + 4)],
    ["cut before the report closes", RELEVE.slice(0, RELEVE.indexOf("</ExceptionReport>"))],
    ["cut inside the attribute", RELEVE.slice(0, RELEVE.indexOf("Found"))],
    ["cut inside a comment", `<!-- ${RELEVE}`],
    ["cut inside the prologue", `<?xml version="1.0"`],
    ["text after the report", `${RELEVE}Not Found`],
    ["a second root", `${RELEVE}${RELEVE}`],
    ["a closing tag that does not match", RELEVE.replace("</Exception>", "</Other>")],
    ["an attribute without quotes", RELEVE.replace('"Not Found"', "Not")],
    ["an attribute between other characters than quotes", RELEVE.replace('"Not Found"', "|Not Found|")],
    ["two attributes without a space between them", RELEVE.replace('exceptionCode="Not Found" ', 'locator="TILEROW"exceptionCode="Not Found"')],
    [
      "the attribute given twice",
      `<ExceptionReport xmlns="${OWS}"><Exception exceptionCode="NoApplicableCode" exceptionCode="Not Found"/></ExceptionReport>`,
    ],
    ["a stray ampersand in the attribute", RELEVE.replace('"Not Found"', '"Not Found&"')],
    ["an empty reference in the attribute", RELEVE.replace('"Not Found"', '"Not Found&;"')],
    ["an unknown entity in the attribute", RELEVE.replace('"Not Found"', '"Not&nbsp;Found"')],
    ["a reference to the character 0", RELEVE.replace('"Not Found"', '"Not Found&#0;"')],
    ["a reference past the last character", RELEVE.replace('"Not Found"', '"Not&#x110000;Found"')],
    ["a < in an attribute", RELEVE.replace("<Exception ", '<Exception locator="<" ')],
    ["a CDATA section outside the report", `<![CDATA[x]]>${RELEVE}`],
    ["a document type", `<!DOCTYPE ExceptionReport>${RELEVE}`],
  ])("is false for a body that is %s", (_, text) => {
    expect(isNotFoundReport(text)).toBe(false);
  });
});

/** Whole months from `updated` (`YYYY-MM`) to the month of `now`, in UTC. */
function monthsSince(updated: string, now: Date): number {
  const [year, month] = updated.split("-").map(Number);
  return now.getUTCFullYear() * 12 + now.getUTCMonth() - (year * 12 + month - 1);
}

describe("PLAN_IGN_UPDATED (CA3.4)", () => {
  it("is a year and a month", () => {
    expect(PLAN_IGN_UPDATED).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it("counts whole months, in UTC", () => {
    expect(monthsSince("2026-10", new Date("2026-10-01T00:00:00Z"))).toBe(0);
    expect(monthsSince("2026-10", new Date("2027-10-31T23:59:59Z"))).toBe(12);
    expect(monthsSince("2026-10", new Date("2027-11-01T00:00:00Z"))).toBe(13);
    expect(monthsSince("2026-12", new Date("2027-01-15T00:00:00Z"))).toBe(1);
  });

  it("is not in the future", () => {
    expect(monthsSince(PLAN_IGN_UPDATED, new Date())).toBeGreaterThanOrEqual(0);
  });

  it("fails when it is more than 12 months old: the attribution's date must be read again", () => {
    expect(monthsSince(PLAN_IGN_UPDATED, new Date())).toBeLessThanOrEqual(12);
  });
});
