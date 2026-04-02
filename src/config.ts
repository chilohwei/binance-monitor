import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

const configSchema = z.object({
  binanceApiKey: z.string().min(1),
  binanceApiSecret: z.string().min(1),
  bark: z.object({
    server: z.string().url(),
    keys: z.array(z.string().min(1)).min(1),
    defaultLevel: z
      .enum(["active", "timeSensitive", "passive", "critical"])
      .default("critical"),
    defaultSound: z.string().default("alarm"),
    icon: z.string().url().default(
      "https://public.bnbstatic.com/20190405/eb2349c3-b2f8-4a93-a286-8f86a62ea9d8.png",
    ),
    volume: z.number().int().min(0).max(10).default(10),
    badge: z.number().int().min(0).default(1),
    call: z.number().int().min(0).max(1).default(1),
    isArchive: z.number().int().min(0).max(1).default(1),
    maxRetries: z.number().int().min(0).default(3),
  }),
  telegram: z.object({
    botToken: z.string().min(1),
    chatId: z.string().min(1),
    disablePreview: z.boolean().default(false),
    disableNotification: z.boolean().default(false),
    maxRetries: z.number().int().min(0).default(3),
  }),
  announcement: z.object({
    catalogIds: z.array(z.number().int()).min(1),
    keywords: z.array(z.string()),
    group: z.string().default("币安公告"),
  }),
  alpha: z.object({
    apiPollInterval: z.number().int().min(5).default(10),
    group: z.string().default("Alpha监控"),
  }),
  announcementPoll: z.object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().int().min(5000).default(30000),
    pageSize: z.number().int().min(1).max(50).default(10),
  }),
  ws: z.object({
    pingIntervalMs: z.number().int().min(5000).default(25000),
    reconnectMinMs: z.number().int().min(500).default(1000),
    reconnectMaxMs: z.number().int().min(1000).default(30000),
  }),
  store: z.object({
    ttlDays: z.number().int().min(1).default(30),
    flushDebounceMs: z.number().int().min(100).default(500),
  }),
  healthPort: z.number().int().min(0).default(8080),
  logLevel: z.string().default("info"),
  dataDir: z.string().default("./data"),
});

export type Config = z.infer<typeof configSchema>;

function parseCommaSeparated(val: string): string[] {
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildRawConfig() {
  return {
    binanceApiKey: env("BINANCE_API_KEY"),
    binanceApiSecret: env("BINANCE_API_SECRET"),
    bark: {
      server: env("BARK_SERVER", "https://bark.chiloh.com"),
      keys: parseCommaSeparated(env("BARK_KEYS")),
      defaultLevel: env("BARK_DEFAULT_LEVEL", "critical"),
      defaultSound: env("BARK_DEFAULT_SOUND", "alarm"),
      icon: env("BARK_ICON", "https://public.bnbstatic.com/20190405/eb2349c3-b2f8-4a93-a286-8f86a62ea9d8.png"),
      volume: Number(env("BARK_VOLUME", "10")),
      badge: Number(env("BARK_BADGE", "1")),
      call: Number(env("BARK_CALL", "1")),
      isArchive: Number(env("BARK_IS_ARCHIVE", "1")),
      maxRetries: Number(env("BARK_MAX_RETRIES", "3")),
    },
    telegram: {
      botToken: env("TG_BOT_TOKEN"),
      chatId: env("TG_CHAT_ID"),
      disablePreview: env("TG_DISABLE_PREVIEW", "false") === "true",
      disableNotification: env("TG_DISABLE_NOTIFICATION", "false") === "true",
      maxRetries: Number(env("TG_MAX_RETRIES", "3")),
    },
    announcement: {
      catalogIds: parseCommaSeparated(env("ANNOUNCEMENT_CATALOG_IDS", "48")).map(
        Number,
      ),
      keywords: parseCommaSeparated(
        env("ANNOUNCEMENT_KEYWORDS", "Contract,Futures,合约,期货"),
      ),
      group: env("ANNOUNCEMENT_GROUP", "币安公告"),
    },
    alpha: {
      apiPollInterval: Number(env("ALPHA_API_POLL_INTERVAL", "10")),
      group: env("ALPHA_GROUP", "Alpha监控"),
    },
    announcementPoll: {
      enabled: env("ANNOUNCEMENT_POLL_ENABLED", "true") === "true",
      intervalMs: Number(env("ANNOUNCEMENT_POLL_INTERVAL_MS", "30000")),
      pageSize: Number(env("ANNOUNCEMENT_POLL_PAGE_SIZE", "10")),
    },
    ws: {
      pingIntervalMs: Number(env("WS_PING_INTERVAL_MS", "25000")),
      reconnectMinMs: Number(env("WS_RECONNECT_MIN_MS", "1000")),
      reconnectMaxMs: Number(env("WS_RECONNECT_MAX_MS", "30000")),
    },
    store: {
      ttlDays: Number(env("STORE_TTL_DAYS", "30")),
      flushDebounceMs: Number(env("STORE_FLUSH_DEBOUNCE_MS", "500")),
    },
    healthPort: Number(env("HEALTH_PORT", "8080")),
    logLevel: env("LOG_LEVEL", "info"),
    dataDir: env("DATA_DIR", "./data"),
  };
}

export const config: Config = configSchema.parse(buildRawConfig());
