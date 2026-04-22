import type { NotifyMessage } from "../types.js";
import { isAlphaPriorityEvent, type AlphaEventType } from "../domain/alpha.js";

export type NotificationKind = "announcement" | "alpha";
export type NotificationMode = "single" | "batch";
export type NotificationProfile = "quiet" | "balanced" | "aggressive";

export interface NotificationPolicyInput {
  kind: NotificationKind;
  mode: NotificationMode;
  alphaTypes?: ReadonlyArray<AlphaEventType>;
  profile?: NotificationProfile;
}

const LEVEL_ORDER = [
  "passive",
  "active",
  "timeSensitive",
  "critical",
] as const;

type NotificationLevel = (typeof LEVEL_ORDER)[number];

function resolveBaseLevel(input: NotificationPolicyInput): NotificationLevel {
  if (input.kind === "announcement") {
    return input.mode === "batch" ? "active" : "timeSensitive";
  }

  if ((input.alphaTypes ?? []).some(isAlphaPriorityEvent)) {
    return "timeSensitive";
  }

  return "active";
}

function shiftLevel(level: NotificationLevel, profile: NotificationProfile): NotificationLevel {
  const index = LEVEL_ORDER.indexOf(level);
  if (profile === "balanced") return level;
  if (profile === "quiet") {
    return LEVEL_ORDER[Math.max(0, index - 1)]!;
  }
  return LEVEL_ORDER[Math.min(LEVEL_ORDER.length - 1, index + 1)]!;
}

function resolveLevel(input: NotificationPolicyInput): NotificationLevel {
  const profile = input.profile ?? "balanced";
  return shiftLevel(resolveBaseLevel(input), profile);
}

function resolveCall(
  level: NotificationLevel,
  profile: NotificationProfile,
): number {
  if (profile !== "aggressive") return 0;
  return level === "timeSensitive" || level === "critical" ? 1 : 0;
}

export function applyNotificationPolicy(
  message: NotifyMessage,
  input: NotificationPolicyInput,
): NotifyMessage {
  const profile = input.profile ?? "balanced";
  const level = message.level ?? resolveLevel(input);
  return {
    ...message,
    level,
    call: message.call ?? resolveCall(level, profile),
  };
}
