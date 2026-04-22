import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Notifier, NotifyMessage } from "../src/types.js";
import { NotifyDispatcher } from "../src/notifiers/dispatcher.js";

class CaptureNotifier implements Notifier {
  readonly name = "capture";
  public readonly messages: NotifyMessage[] = [];

  async send(message: NotifyMessage): Promise<void> {
    this.messages.push(message);
  }
}

describe("NotifyDispatcher", () => {
  it("coalesces same-group messages within the batch window", async () => {
    const notifier = new CaptureNotifier();
    const dispatcher = new NotifyDispatcher([notifier], 20);

    const p1 = dispatcher.broadcast({
      title: "Alpha 1",
      body: "Body 1",
      group: "Alpha监控",
      level: "active",
    });
    const p2 = dispatcher.broadcast({
      title: "Alpha 2",
      body: "Body 2",
      group: "Alpha监控",
      level: "timeSensitive",
    });

    await Promise.all([p1, p2]);
    await dispatcher.close();

    assert.equal(notifier.messages.length, 1);
    const msg = notifier.messages[0]!;
    assert.equal(msg.title, "[Alpha监控] 2 条更新");
    assert.ok(msg.body.includes("Alpha 1"));
    assert.ok(msg.body.includes("Alpha 2"));
    assert.equal(msg.level, "timeSensitive");
  });

  it("sends different groups separately", async () => {
    const notifier = new CaptureNotifier();
    const dispatcher = new NotifyDispatcher([notifier], 20);

    const p1 = dispatcher.broadcast({
      title: "A",
      body: "B",
      group: "Group A",
    });
    const p2 = dispatcher.broadcast({
      title: "C",
      body: "D",
      group: "Group B",
    });

    await Promise.all([p1, p2]);
    await dispatcher.close();

    assert.equal(notifier.messages.length, 2);
    assert.notEqual(notifier.messages[0]!.group, notifier.messages[1]!.group);
  });
});
