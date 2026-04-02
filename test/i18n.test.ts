import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  announcementBody,
  alphaEventTitle,
  alphaEventBody,
} from "../src/utils/i18n.js";

describe("announcementBody", () => {
  it("includes English title and Chinese hint", () => {
    const body = announcementBody("Binance Will List XYZ");
    assert.ok(body.includes("Binance Will List XYZ"));
    assert.ok(body.includes("———————————"));
    assert.ok(body.includes("币安新公告"));
  });
});

describe("alphaEventTitle", () => {
  it("includes bilingual labels for known types", () => {
    const t1 = alphaEventTitle("new_token", "BTC");
    assert.ok(t1.includes("New Alpha Token"));
    assert.ok(t1.includes("Alpha 新代币上线"));
    assert.ok(t1.includes("BTC"));

    const t2 = alphaEventTitle("airdrop_live", "ETH");
    assert.ok(t2.includes("Airdrop Live"));
    assert.ok(t2.includes("空投已开启"));
  });

  it("falls back for unknown type", () => {
    assert.equal(alphaEventTitle("unknown", "TEST"), "🚀 TEST");
  });
});

describe("alphaEventBody", () => {
  it("formats large numbers with M suffix", () => {
    const body = alphaEventBody("Bitcoin", "BTC", "1", "50000", "1000000000");
    assert.ok(body.includes("$50.00K"));
    assert.ok(body.includes("$1000.00M"));
  });

  it("formats small numbers with precision", () => {
    const body = alphaEventBody("Test", "T", "56", "0.0054", "0");
    assert.ok(body.includes("$0.005400"));
  });

  it("includes bilingual sections", () => {
    const body = alphaEventBody("Foo", "FOO", "1", "1", "1");
    assert.ok(body.includes("Chain:"));
    assert.ok(body.includes("链:"));
    assert.ok(body.includes("Price:"));
    assert.ok(body.includes("价格:"));
  });
});
