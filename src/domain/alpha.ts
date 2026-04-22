export const ALPHA_EVENT_TYPES = [
  "new_token",
  "airdrop_live",
  "tge_live",
] as const;

export type AlphaEventType = (typeof ALPHA_EVENT_TYPES)[number];

export const ALPHA_EVENT_LABELS: Record<AlphaEventType, { en: string; zh: string }> = {
  new_token: { en: "New Alpha Token", zh: "Alpha 新代币上线" },
  airdrop_live: { en: "Airdrop Live", zh: "空投已开启" },
  tge_live: { en: "TGE Live", zh: "TGE 已开启" },
};

const ALPHA_PRIORITY_EVENT_TYPES = new Set<AlphaEventType>([
  "airdrop_live",
  "tge_live",
]);

export function isAlphaPriorityEvent(type: AlphaEventType): boolean {
  return ALPHA_PRIORITY_EVENT_TYPES.has(type);
}

export function dedupeAlphaEventTypes(
  types: ReadonlyArray<AlphaEventType>,
): AlphaEventType[] {
  return Array.from(new Set(types));
}
