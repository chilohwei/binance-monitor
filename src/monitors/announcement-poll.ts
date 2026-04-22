import { config } from "../config.js";
import { matchesAnnouncementKeywords } from "../domain/announcement.js";
import {
  BINANCE_MONITOR_USER_AGENT,
  BINANCE_WEB_ORIGIN,
  buildAnnouncementUrl,
} from "../domain/binance.js";
import type { Monitor } from "../types.js";
import { NotifyDispatcher } from "../notifiers/dispatcher.js";
import { getPool } from "../utils/http.js";
import { ANNOUNCEMENT_HINT, announcementBody } from "../utils/i18n.js";
import { bapiResponseSchema } from "../schemas.js";
import { createChildLogger } from "../utils/logger.js";
import {
  AnnouncementDeduper,
  announcementDedupKey,
} from "../utils/announcement-deduper.js";
import { applyNotificationPolicy } from "../utils/notification-policy.js";
import { MonitorTelemetry } from "../runtime/monitor-telemetry.js";
import { PollingLoop } from "../runtime/polling-loop.js";

const log = createChildLogger("announcement-poll");

const PATH = "/bapi/composite/v1/public/cms/article/catalog/list/query";

interface BapiArticle {
  code: string;
  title: string;
}

interface PendingAnnouncement {
  dedupKey: string;
  title: string;
  url: string;
}

function announcementDigestTitle(count: number): string {
  return `[公告] ${count} 条新公告`;
}

function announcementDigestBody(items: PendingAnnouncement[]): string {
  const sections = items.map((item, index) => {
    return [
      `${index + 1}. ${item.title}`,
      item.url,
    ].join("\n");
  });

  return `${sections.join("\n\n")}\n\n${ANNOUNCEMENT_HINT}`;
}

export class AnnouncementPollMonitor implements Monitor {
  readonly name = "announcement-poll";
  private initialized = false;
  private readonly telemetry = new MonitorTelemetry(this.name);
  private readonly loop = new PollingLoop({
    intervalMs: config.announcementPoll.intervalMs,
    run: () => this.poll(),
    onError: (err) => {
      this.telemetry.error(err);
      log.error({ err }, "poll error");
    },
  });

  constructor(
    private readonly dispatcher: NotifyDispatcher,
    private readonly deduper: AnnouncementDeduper,
  ) {}

  async start(): Promise<void> {
    this.initialized = this.deduper.size > 0;
    await this.loop.start();
  }

  async stop(): Promise<void> {
    this.loop.stop();
  }

  private async fetchArticlesPage(
    catalogId: number,
    pageNo: number,
  ): Promise<BapiArticle[]> {
    const pool = getPool(BINANCE_WEB_ORIGIN);
    const queryPath = `${PATH}?catalogId=${catalogId}&pageNo=${pageNo}&pageSize=${config.announcementPoll.pageSize}`;

    const { statusCode, body } = await pool.request({
      path: queryPath,
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": BINANCE_MONITOR_USER_AGENT,
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

  private async fetchArticles(catalogId: number): Promise<BapiArticle[]> {
    const articles: BapiArticle[] = [];

    for (let pageNo = 1; pageNo <= config.announcementPoll.maxPages; pageNo++) {
      const page = await this.fetchArticlesPage(catalogId, pageNo);
      articles.push(...page);
      if (page.length < config.announcementPoll.pageSize) {
        break;
      }
    }

    return articles;
  }

  private async poll(): Promise<void> {
    log.debug("polling announcement BAPI");
    this.telemetry.count("polls");

    let allCatalogsSucceeded = true;
    for (const catalogId of config.announcement.catalogIds) {
      try {
        await this.pollCatalog(catalogId);
      } catch (err) {
        allCatalogsSucceeded = false;
        this.telemetry.error(err);
        log.error({ err, catalogId }, "catalog poll failed, continuing");
      }
    }

    if (!this.initialized && allCatalogsSucceeded) {
      log.info({ baseline: this.deduper.size }, "BAPI baseline established");
      this.initialized = true;
    }

    this.telemetry.alive();
  }

  private async pollCatalog(catalogId: number): Promise<void> {
    const articles = await this.fetchArticles(catalogId);
    log.debug({ catalogId, count: articles.length }, "fetched articles");

    const pending: PendingAnnouncement[] = [];
    const baselineConfirm: string[] = [];

    for (const article of articles) {
      this.telemetry.count("seen");
      const dedupKey = announcementDedupKey({
        catalogId,
        title: article.title,
        code: article.code,
      });
      if (!this.deduper.claim(dedupKey)) {
        this.telemetry.count("deduped");
        continue;
      }

      if (!this.initialized) {
        baselineConfirm.push(dedupKey);
        this.telemetry.count("seeded");
        continue;
      }

      // BAPI only returns title, no body — keyword matching is title-only here
      if (!matchesAnnouncementKeywords({ title: article.title }, config.announcement.keywords)) {
        baselineConfirm.push(dedupKey);
        this.telemetry.count("filtered");
        log.debug({ title: article.title }, "filtered out by keywords");
        continue;
      }

      const url = buildAnnouncementUrl(article.code);
      if (!url) {
        this.deduper.confirm(dedupKey);
        this.telemetry.count("filtered");
        log.debug({ title: article.title }, "filtered out due to missing announcement url");
        continue;
      }
      pending.push({
        dedupKey,
        title: article.title,
        url,
      });
    }

    if (!this.initialized) {
      for (const key of baselineConfirm) {
        this.deduper.confirm(key);
      }
      return;
    }

    if (pending.length === 0) return;

    const message =
      pending.length === 1
        ? {
            title: `[公告] ${pending[0]!.title}`,
            body: announcementBody(pending[0]!.title),
            group: config.announcement.group,
            url: pending[0]!.url,
            sound: config.bark.defaultSound,
          }
        : {
            title: announcementDigestTitle(pending.length),
            body: announcementDigestBody(pending),
            group: config.announcement.group,
            url: pending[0]!.url,
            sound: config.bark.defaultSound,
          };
    const prepared = applyNotificationPolicy(message, {
      kind: "announcement",
      mode: pending.length > 1 ? "batch" : "single",
      profile: config.notification.profile,
    });

    log.info(
      {
        catalogId,
        count: pending.length,
        firstTitle: pending[0]!.title,
      },
      "new announcement batch from BAPI",
    );

    try {
      await this.dispatcher.broadcast(prepared);
      for (const item of pending) {
        this.deduper.confirm(item.dedupKey);
      }
      this.telemetry.count("sent", pending.length);
    } catch (err) {
      for (const item of pending) {
        this.deduper.release(item.dedupKey);
      }
      this.telemetry.error(err, pending.length);
      log.error(
        { err, count: pending.length, catalogId },
        "all channels failed, will retry next poll",
      );
    }
  }
}
