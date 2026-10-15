import { describe, expect, it } from "vitest";
import { browserUnsafe, nodeBuiltinsImported } from "./test-browser-safe";

describe("nodeBuiltinsImported", () => {
  it("finds a Node built-in with or without node:, however it is imported", () => {
    for (const line of [
      'import { randomBytes } from "crypto";',
      'import { randomBytes } from "node:crypto";',
      "import { Buffer as B } from 'buffer';",
      'import { readFile } from "fs/promises";',
      'import * as os from "os";',
      'import "node:process";',
      'export { createHash } from "crypto";',
      'const crypto = await import("crypto");',
      'const { webcrypto } = require("crypto");',
      'import x from "node:not-even-a-module";',
    ]) {
      expect(nodeBuiltinsImported(line), line).toHaveLength(1);
    }
  });

  it("ignores packages and relative modules", () => {
    const source = ['import { z } from "zod";', 'import { x } from "./crypto";', 'import y from "@scope/buffer";'].join("\n");
    expect(nodeBuiltinsImported(source)).toEqual([]);
  });
});

describe("browserUnsafe", () => {
  it("also refuses Buffer used as a global", () => {
    expect(browserUnsafe("const b = Buffer.from(bytes);")).toEqual(["Buffer"]);
    expect(browserUnsafe("const b = new Uint8Array(16);")).toEqual([]);
  });
});
