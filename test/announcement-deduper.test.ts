import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AnnouncementDeduper,
  announcementDedupKey,
} from "../src/utils/announcement-deduper.js";

const testFile = join(tmpdir(), `announcement-deduper-${process.pid}.json`);

async function cleanup() {
  try {
    await unlink(testFile);
  } catch {
    /* ignore */
  }
}

describe("announcementDedupKey", () => {
  afterEach(cleanup);

  it("prefers code when available so WS and BAPI collapse to the same key", () => {
    const ws = announcementDedupKey({
      catalogId: 48,
      title: "Binance Will List XYZ",
      code: "abc123",
    });
    const bapi = announcementDedupKey({
      catalogId: 999,
      title: "Different title but same code",
      code: "abc123",
    });

    assert.equal(ws, bapi);
  });

  it("falls back to normalized title within the same catalog", () => {
    const a = announcementDedupKey({
      catalogId: 48,
      title: "  Binance   Futures  Launch  ",
    });
    const b = announcementDedupKey({
      catalogId: 48,
      title: "Binance Futures Launch",
    });

    assert.equal(a, b);
  });
});

describe("AnnouncementDeduper", () => {
  afterEach(cleanup);

  it("claims, confirms, and releases keys", async () => {
    const deduper = new AnnouncementDeduper(testFile, 30, 0);
    await deduper.load();

    const key = announcementDedupKey({
      catalogId: 48,
      title: "Binance Futures Launch",
    });

    assert.equal(deduper.claim(key), true);
    assert.equal(deduper.claim(key), false);
    deduper.release(key);
    assert.equal(deduper.claim(key), true);
    deduper.confirm(key);
    assert.equal(deduper.has(key), true);

    await deduper.close();
  });
});
