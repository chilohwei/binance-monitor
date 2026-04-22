import { ALPHA_EVENT_LABELS, type AlphaEventType } from "../domain/alpha.js";

const DIVIDER = "\n———————————\n";
export const ANNOUNCEMENT_HINT = "📢 币安新公告，请查看详情";

export function announcementBody(title: string): string {
  return `${title}${DIVIDER}${ANNOUNCEMENT_HINT}`;
}

export function alphaEventTitle(typeOrTypes: string | string[], symbol: string): string {
  const types = Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes];
  const labels = types
    .map((type) => ALPHA_EVENT_LABELS[type as AlphaEventType])
    .filter((label): label is { en: string; zh: string } => Boolean(label));

  if (labels.length === 0) return `🚀 ${symbol}`;

  const en = labels.map((label) => label.en).join(" / ");
  const zh = labels.map((label) => label.zh).join(" / ");
  return `🚀 ${en}: ${symbol} | ${zh}`;
}

export function alphaEventBody(
  name: string,
  symbol: string,
  chainId: string,
  price: string,
  marketCap: string,
): string {
  const priceFormatted = formatNumber(price);
  const mcFormatted = formatNumber(marketCap);

  const en = [
    `${name} (${symbol})`,
    `Chain: ${chainId}`,
    `Price: $${priceFormatted}`,
    `Market Cap: $${mcFormatted}`,
  ].join("\n");

  const zh = [
    `${name} (${symbol})`,
    `链: ${chainId}`,
    `价格: $${priceFormatted}`,
    `市值: $${mcFormatted}`,
  ].join("\n");

  return `${en}${DIVIDER}${zh}`;
}

function formatNumber(raw: string): string {
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  if (num >= 1) return num.toFixed(2);
  return num.toPrecision(4);
}
