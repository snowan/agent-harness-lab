import { describe, expect, it } from "vitest";
import {
  WEBMCP_TOOL_CONTRACTS,
  WEBMCP_TOOL_NAMES,
} from "../../src/webmcp/contracts";

function parameterDescriptions(schema: Readonly<Record<string, unknown>>): string[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.values(properties as Record<string, unknown>).flatMap((property) => {
    if (!property || typeof property !== "object" || Array.isArray(property)) return [];
    const description = (property as Record<string, unknown>).description;
    return typeof description === "string" ? [description] : [];
  });
}

describe("WebMCP discovery contracts", () => {
  it("publishes the exact eight-tool surface in stable order", () => {
    expect(WEBMCP_TOOL_CONTRACTS.map((tool) => tool.name)).toEqual(WEBMCP_TOOL_NAMES);
    expect(new Set(WEBMCP_TOOL_NAMES).size).toBe(8);
  });

  it("keeps names, descriptions, parameters, and schemas within browser guidance", () => {
    for (const tool of WEBMCP_TOOL_CONTRACTS) {
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(30);
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(500);
      expect(tool.description.trim().length, tool.name).toBeGreaterThan(0);
      expect(JSON.parse(JSON.stringify(tool.inputSchema))).toEqual(tool.inputSchema);
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      for (const description of parameterDescriptions(tool.inputSchema)) {
        expect(description.length, `${tool.name}: ${description}`).toBeLessThanOrEqual(150);
      }
      const properties = tool.inputSchema.properties;
      if (properties && typeof properties === "object" && !Array.isArray(properties)) {
        for (const parameter of Object.keys(properties)) {
          expect(parameter.length, `${tool.name}.${parameter}`).toBeLessThanOrEqual(30);
        }
      }
    }
  });

  it("marks only true reads as read-only and labels only authored state content as untrusted", () => {
    const reads = WEBMCP_TOOL_CONTRACTS
      .filter((tool) => tool.annotations.readOnlyHint)
      .map((tool) => tool.name);
    expect(reads).toEqual([
      "get_lab_state",
      "inspect_trace",
      "compare_harnesses",
      "export_evidence_receipt",
    ]);
    expect(
      WEBMCP_TOOL_CONTRACTS
        .filter((tool) => tool.annotations.untrustedContentHint)
        .map((tool) => tool.name),
    ).toEqual(["get_lab_state"]);
  });

  it("does not discover human decisions or expansive capabilities", () => {
    const discovered = WEBMCP_TOOL_NAMES.join(" ");
    for (const prohibited of [
      "promote",
      "reject",
      "deploy",
      "fetch_url",
      "filesystem",
      "execute_code",
    ]) {
      expect(discovered).not.toContain(prohibited);
    }
  });
});
