import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  matchesAnnouncementFilter,
  matchesAnnouncementKeywords,
} from "../src/domain/announcement.js";
import { buildAnnouncementUrl } from "../src/domain/binance.js";

describe("announcement domain", () => {
  it("builds announcement detail urls from article code", () => {
    assert.equal(
      buildAnnouncementUrl("abc123"),
      "https://www.binance.com/en/support/announcement/detail/abc123",
    );
    assert.equal(buildAnnouncementUrl(""), undefined);
  });

  it("matches catalog and keyword filters against title and body", () => {
    assert.equal(
      matchesAnnouncementFilter(
        {
          catalogId: 48,
          title: "Binance Futures Launch",
          body: "New perpetual contract",
        },
        {
          catalogIds: [48],
          keywords: ["perpetual"],
        },
      ),
      true,
    );
  });

  it("rejects announcements outside the watched catalog", () => {
    assert.equal(
      matchesAnnouncementFilter(
        {
          catalogId: 49,
          title: "Binance Futures Launch",
        },
        {
          catalogIds: [48],
          keywords: [],
        },
      ),
      false,
    );
  });

  it("matches title-only keyword checks when no body is available", () => {
    assert.equal(
      matchesAnnouncementKeywords(
        { title: "Binance Futures Launch" },
        ["Futures"],
      ),
      true,
    );
    assert.equal(
      matchesAnnouncementKeywords(
        { title: "Binance Spot Launch" },
        ["Futures"],
      ),
      false,
    );
  });
});
