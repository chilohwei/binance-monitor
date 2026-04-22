import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PollingLoop } from "../src/runtime/polling-loop.js";
import { sleep } from "../src/utils/sleep.js";

describe("PollingLoop", () => {
  it("awaits the first run during startup", async () => {
    let attempts = 0;

    const loop = new PollingLoop({
      intervalMs: 50,
      run: async () => {
        await sleep(10);
        attempts += 1;
      },
    });

    await loop.start();
    loop.stop();

    assert.equal(attempts, 1);
  });

  it("keeps scheduling after a failure", async () => {
    const events: string[] = [];
    let attempts = 0;

    const loop = new PollingLoop({
      intervalMs: 10,
      run: async () => {
        attempts += 1;
        events.push(`run:${attempts}`);
        if (attempts === 1) {
          throw new Error("boom");
        }
      },
      onError: async () => {
        events.push("error");
      },
    });

    await loop.start();
    const deadline = Date.now() + 200;
    while (attempts < 2 && Date.now() < deadline) {
      await sleep(5);
    }
    loop.stop();

    assert.ok(attempts >= 2);
    assert.ok(events.includes("error"));
  });
});
