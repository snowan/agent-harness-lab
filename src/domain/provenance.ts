import type { Actor, CommandSource } from "./types";

export function isAllowedActorSourcePair(
  actor: Actor,
  source: CommandSource,
): boolean {
  if (source === "test") return true;
  return (actor === "human" && source === "ui")
    || (actor === "agent" && source === "webmcp")
    || (actor === "system" && source === "bootstrap");
}

export function isAllowedHumanDecisionSource(source: CommandSource): boolean {
  return source === "ui" || source === "test";
}
