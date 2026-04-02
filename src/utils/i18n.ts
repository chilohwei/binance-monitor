const DIVIDER = "\n———————————\n";

const ALPHA_EVENT_LABELS: Record<string, { en: string; zh: string }> = {
  new_token: { en: "New Alpha Token", zh: "Alpha 新代币上线" },
  airdrop_live: { en: "Airdrop Live", zh: "空投已开启" },
  tge_live: { en: "TGE Live", zh: "TGE 已开启" },
};

export function bilingualTitle(en: string, zh: string): string {
  return `${en}${DIVIDER}${zh}`;
}

export function announcementBody(title: string): string {
  return `${title}${DIVIDER}📢 币安新公告，请查看详情`;
}

export function alphaEventTitle(type: string, symbol: string): string {
  const label = ALPHA_EVENT_LABELS[type];
  if (!label) return `🚀 ${symbol}`;
  return `🚀 ${label.en}: ${symbol} | ${label.zh}`;
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
