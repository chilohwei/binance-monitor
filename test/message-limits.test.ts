import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NotifyMessage } from "../src/types.js";
import {
  BARK_BODY_LIMIT,
  BARK_GROUP_LIMIT,
  BARK_TITLE_LIMIT,
  TELEGRAM_TEXT_LIMIT,
  clampBarkMessage,
  formatTelegramMessages,
  normalizeBarkGroup,
} from "../src/notifiers/message-limits.js";

describe("message limits", () => {
  it("truncates oversized Bark messages before send", () => {
    const message: NotifyMessage = {
      title: "T".repeat(BARK_TITLE_LIMIT + 40),
      body: `Header\n\n${"payload ".repeat(500)}`,
      group: "G".repeat(BARK_GROUP_LIMIT + 20),
      url: "https://example.com/very-long-url",
    };

    const safe = clampBarkMessage(message);

    assert.equal(safe.url, message.url);
    assert.ok(safe.title.length <= BARK_TITLE_LIMIT);
    assert.ok(safe.body.length <= BARK_BODY_LIMIT);
    assert.ok(safe.group.length <= BARK_GROUP_LIMIT);
    assert.match(safe.body, /\(truncated\)$/);
  });

  it("normalizes Bark groups for notification grouping", () => {
    assert.equal(normalizeBarkGroup("  Alpha监控  "), "Alpha监控");
    assert.equal(normalizeBarkGroup("   "), "Binance Monitor");
    assert.ok(normalizeBarkGroup("G".repeat(120)).length <= BARK_GROUP_LIMIT);
  });

  it("keeps short Telegram messages in one chunk", () => {
    const message: NotifyMessage = {
      title: "Short title",
      body: "Short body",
      group: "telegram",
      url: "https://example.com/a",
    };

    const parts = formatTelegramMessages(message);

    assert.equal(parts.length, 1);
    assert.ok(parts[0]!.includes("<b>Short title</b>"));
    assert.ok(parts[0]!.includes("Short body"));
    assert.ok(parts[0]!.includes("https://example.com/a"));
  });

  it("splits oversized Telegram messages into safe chunks", () => {
    const body = Array.from({ length: 180 }, (_, index) => {
      return `${index + 1}. BTC & ETH <watch> breakout candidate with repeated context for safe chunking.`;
    }).join("\n");

    const message: NotifyMessage = {
      title: "Batch digest",
      body,
      group: "telegram",
      url: "https://example.com/digest",
    };

    const parts = formatTelegramMessages(message);

    assert.ok(parts.length > 1);
    for (const part of parts) {
      assert.ok(part.length <= TELEGRAM_TEXT_LIMIT);
    }
    assert.ok(parts[0]!.includes("<b>Batch digest</b>"));
    assert.ok(parts[1]!.includes("Batch digest"));
    assert.ok(parts[1]!.includes("（续）"));
    assert.ok(parts.at(-1)!.includes("https://example.com/digest"));
  });
});
