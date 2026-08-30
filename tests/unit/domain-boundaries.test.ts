import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("domain dependency boundary", () => {
  it("does not import adapters or access browser-only globals", () => {
    const domainDir = path.resolve("src/domain");
    const sources = readdirSync(domainDir)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => ({
        file,
        source: readFileSync(path.join(domainDir, file), "utf8"),
      }));

    const forbiddenImport = /from\s+["'](?:react|react-dom|\.\.\/app|\.\.\/webmcp|\.\.\/ui)/;
    const forbiddenGlobal = /\b(?:document|window|localStorage|sessionStorage|navigator|modelContext)\b/;

    for (const { file, source } of sources) {
      expect(source, `${file} imports an adapter`).not.toMatch(forbiddenImport);
      expect(source, `${file} accesses a browser-only global`).not.toMatch(forbiddenGlobal);
    }
  });
});
