import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PersistentStore } from "../src/utils/store.js";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testFile = join(tmpdir(), `test-store-${process.pid}.json`);

async function cleanup() {
  try {
    await unlink(testFile);
  } catch {
    /* ignore */
  }
}

describe("PersistentStore", () => {
  afterEach(cleanup);

  it("set / get / has", () => {
    const store = new PersistentStore<string>(testFile);
    store.set("a", "hello");
    assert.equal(store.get("a"), "hello");
    assert.equal(store.has("a"), true);
    assert.equal(store.has("b"), false);
    assert.equal(store.size, 1);
  });

  it("persist and reload", async () => {
    const s1 = new PersistentStore<string>(testFile);
    s1.set("k", "v");
    await s1.close();

    const s2 = new PersistentStore<string>(testFile);
    await s2.load();
    assert.equal(s2.get("k"), "v");
    await s2.close();
  });

  it("handles missing file gracefully", async () => {
    const store = new PersistentStore<string>(testFile);
    await store.load();
    assert.equal(store.size, 0);
  });

  it("handles corrupt file gracefully", async () => {
    await writeFile(testFile, "NOT VALID JSON!!!", "utf-8");
    const store = new PersistentStore<string>(testFile);
    await store.load();
    assert.equal(store.size, 0);
  });
});
