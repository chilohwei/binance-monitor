import type { Notifier, NotifyMessage } from "../types.js";
import { recordNotifierResult } from "../health.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("dispatcher");

const LEVEL_RANK: Record<NonNullable<NotifyMessage["level"]>, number> = {
  passive: 0,
  active: 1,
  timeSensitive: 2,
  critical: 3,
};

interface PendingBroadcast {
  message: NotifyMessage;
  resolve: () => void;
  reject: (err: unknown) => void;
}

interface QueueBucket {
  items: PendingBroadcast[];
  timer: ReturnType<typeof setTimeout> | null;
}

function normalizeLevel(level: NotifyMessage["level"]): NonNullable<NotifyMessage["level"]> {
  return level ?? "active";
}

function digestMessages(messages: NotifyMessage[]): NotifyMessage {
  if (messages.length === 1) {
    return messages[0]!;
  }

  const first = messages[0]!;
  const group = first.group || "Binance Monitor";
  const highest = messages.reduce((best, current) => {
    const bestRank = LEVEL_RANK[normalizeLevel(best.level)];
    const currentRank = LEVEL_RANK[normalizeLevel(current.level)];
    return currentRank > bestRank ? current : best;
  }, first);

  const body = messages
    .map((message, index) => {
      const parts = [
        `${index + 1}. ${message.title}`,
        message.body,
        message.url ? `🔗 ${message.url}` : "",
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n———————————\n\n");

  return {
    title: `[${group}] ${messages.length} 条更新`,
    body,
    group,
    level: normalizeLevel(highest.level),
    sound: highest.sound ?? first.sound,
    call: Math.max(...messages.map((m) => m.call ?? 0)),
  };
}

export class NotifyDispatcher {
  private readonly pending = new Map<string, QueueBucket>();

  constructor(
    private readonly notifiers: Notifier[],
    private readonly batchWindowMs = 0,
  ) {}

  /**
   * Broadcast to all notifiers concurrently.
   * Throws AggregateError only when ALL notifiers fail (at-least-once semantics).
   */
  async broadcast(message: NotifyMessage): Promise<void> {
    if (this.batchWindowMs <= 0) {
      await this.sendNow(message);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const key = message.group || "__default__";
      let bucket = this.pending.get(key);
      if (!bucket) {
        bucket = { items: [], timer: null };
        this.pending.set(key, bucket);
      }

      bucket.items.push({ message, resolve, reject });

      if (!bucket.timer) {
        bucket.timer = setTimeout(() => {
          void this.flushBucket(key);
        }, this.batchWindowMs);
      }
    });
  }

  async close(): Promise<void> {
    const keys = Array.from(this.pending.keys());
    for (const key of keys) {
      const bucket = this.pending.get(key);
      if (bucket?.timer) {
        clearTimeout(bucket.timer);
        bucket.timer = null;
      }
    }

    await Promise.allSettled(keys.map((key) => this.flushBucket(key)));
  }

  private async flushBucket(key: string): Promise<void> {
    const bucket = this.pending.get(key);
    if (!bucket) return;

    this.pending.delete(key);
    if (bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }

    const items = bucket.items.splice(0);
    if (items.length === 0) return;

    const messages = items.map((item) => item.message);
    const outbound = digestMessages(messages);
    if (messages.length > 1) {
      log.info(
        {
          group: key,
          count: messages.length,
          title: outbound.title,
        },
        "notification digest sent",
      );
    }

    try {
      await this.sendNow(outbound);
      for (const item of items) {
        item.resolve();
      }
    } catch (err) {
      for (const item of items) {
        item.reject(err);
      }
    }
  }

  private async sendNow(message: NotifyMessage): Promise<void> {
    const results = await Promise.allSettled(
      this.notifiers.map((n) => n.send(message)),
    );

    const errors: Error[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const notifierName = this.notifiers[i]!.name;
      if (r.status === "rejected") {
        const err =
          r.reason instanceof Error ? r.reason : new Error(String(r.reason));
        errors.push(err);
        log.error(
          { notifier: notifierName, err: r.reason },
          "notifier broadcast failed",
        );
        recordNotifierResult(notifierName, false, err);
      } else {
        recordNotifierResult(notifierName, true);
      }
    }

    if (errors.length > 0 && errors.length === results.length) {
      throw new AggregateError(errors, "all notifiers failed");
    }
  }
}
