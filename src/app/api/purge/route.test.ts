import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as route from "./route";

describe("the daily purge", () => {
  it("is called by one Vercel Cron, once a day, on the path alone: no secret in a URL", () => {
    const config = JSON.parse(readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"));
    expect(config.crons).toEqual([{ path: "/api/purge", schedule: "0 3 * * *" }]);
  });

  it("exports GET alone, as Vercel Cron calls it", () => {
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
