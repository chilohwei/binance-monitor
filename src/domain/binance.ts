export const BINANCE_WEB_ORIGIN = "https://www.binance.com";
export const BINANCE_MONITOR_USER_AGENT = "BinanceMonitor/1.0";

export function buildAnnouncementUrl(code?: string): string | undefined {
  return code
    ? `${BINANCE_WEB_ORIGIN}/en/support/announcement/detail/${code}`
    : undefined;
}
