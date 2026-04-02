import { config } from "../config.js";
import type { Monitor } from "../types.js";
import { NotifyDispatcher } from "../notifiers/dispatcher.js";
import { PersistentStore } from "../utils/store.js";
import { getPool } from "../utils/http.js";
import { announcementBody } from "../utils/i18n.js";
import { bapiResponseSchema } from "../schemas.js";
import { reportAlive } from "../health.js";
import { createChildLogger } from "../utils/logger.js";
import { join } from "node:path";

const log = createChildLogger("announcement-poll");

const ORIGIN = "https://www.binance.com";
const PATH = "/bapi/composite/v1/public/cms/article/catalog/list/query";

interface BapiArticle {
  id: number;
  code: string;
  title: string;
}

export class AnnouncementPollMonitor implements Monitor {
  readonly name = "announcement-poll";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private initialized = false;
  private store: PersistentStore<boolean>;

  constructor(private readonly dispatcher: NotifyDispatcher) {
    this.store = new PersistentStore(
      join(config.dataDir, "announcement-poll-seen.json"),
      config.store.ttlDays,
      config.store.flushDebounceMs,
    );
  }

  async start(): Promise<void> {
    await this.store.load();
    this.initialized = this.store.size > 0;
    this.running = true;
    await this.poll();
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.store.close();
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      try {
        await this.poll();
      } catch (err) {
        log.error({ err }, "poll error");
      }
      this.scheduleNext();
    }, config.announcementPoll.intervalMs);
  }

  private async fetchArticles(catalogId: number): Promise<BapiArticle[]> {
    const pool = getPool(ORIGIN);
    const queryPath = `${PATH}?catalogId=${catalogId}&pageNo=1&pageSize=${config.announcementPoll.pageSize}`;

    const { statusCode, body } = await pool.request({
      path: queryPath,
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "BinanceMonitor/1.0",
      },
    });

    const raw = await body.text();
    if (statusCode !== 200) {
      throw new Error(`bapi http ${statusCode}: ${raw.slice(0, 200)}`);
    }

    const parsed = bapiResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`bapi schema validation failed: ${parsed.error.message}`);
    }

    return parsed.data.data.articles;
  }

  private async poll(): Promise<void> {
    log.debug("polling announcement BAPI");

    for (const catalogId of config.announcement.catalogIds) {
      try {
        await this.pollCatalog(catalogId);
      } catch (err) {
        log.error({ err, catalogId }, "catalog poll failed, continuing");
      }
    }

    if (!this.initialized) {
      log.info({ baseline: this.store.size }, "BAPI baseline established");
      this.initialized = true;
    }

    reportAlive(this.name);
  }

  private async pollCatalog(catalogId: number): Promise<void> {
    const articles = await this.fetchArticles(catalogId);
    log.debug({ catalogId, count: articles.length }, "fetched articles");

    for (const article of articles) {
      const dedupKey = `bapi:${article.id}:${article.code}`;
      if (this.store.has(dedupKey)) continue;

      if (!this.initialized) {
        this.store.set(dedupKey, true);
        continue;
      }

      // BAPI only returns title, no body — keyword matching is title-only here
      if (!this.matchesKeywords(article.title)) {
        this.store.set(dedupKey, true);
        log.debug({ title: article.title }, "filtered out by keywords");
        continue;
      }

      const url = `https://www.binance.com/en/support/announcement/detail/${article.code}`;

      log.info(
        { title: article.title, code: article.code },
        "new announcement from BAPI",
      );

      try {
        await this.dispatcher.broadcast({
          title: `[公告] ${article.title}`,
          body: announcementBody(article.title),
          group: config.announcement.group,
          url,
          level: config.bark.defaultLevel,
          sound: config.bark.defaultSound,
        });
        this.store.set(dedupKey, true);
      } catch (err) {
        log.error({ err, title: article.title }, "all channels failed, will retry next poll");
      }
    }
  }

  private matchesKeywords(title: string): boolean {
    const { keywords } = config.announcement;
    if (keywords.length === 0) return true;
    return keywords.some((kw) => title.includes(kw));
  }
}
