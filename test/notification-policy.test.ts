import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyNotificationPolicy } from "../src/utils/notification-policy.js";

describe("applyNotificationPolicy", () => {
  it("keeps single announcements timeSensitive but disables call", () => {
    const msg = applyNotificationPolicy(
      {
        title: "Announcement",
        body: "Body",
        group: "Group",
      },
      { kind: "announcement", mode: "single" },
    );

    assert.equal(msg.level, "timeSensitive");
    assert.equal(msg.call, 0);
  });

  it("downgrades announcement batches to active", () => {
    const msg = applyNotificationPolicy(
      {
        title: "Digest",
        body: "Body",
        group: "Group",
      },
      { kind: "announcement", mode: "batch" },
    );

    assert.equal(msg.level, "active");
    assert.equal(msg.call, 0);
  });

  it("treats new token alpha events as active", () => {
    const msg = applyNotificationPolicy(
      {
        title: "Alpha",
        body: "Body",
        group: "Group",
      },
      { kind: "alpha", mode: "single", alphaTypes: ["new_token"] },
    );

    assert.equal(msg.level, "active");
    assert.equal(msg.call, 0);
  });

  it("keeps live alpha events timeSensitive", () => {
    const msg = applyNotificationPolicy(
      {
        title: "Alpha",
        body: "Body",
        group: "Group",
      },
      { kind: "alpha", mode: "single", alphaTypes: ["airdrop_live"] },
    );

    assert.equal(msg.level, "timeSensitive");
    assert.equal(msg.call, 0);
  });

  it("lets quiet profile reduce notification intensity", () => {
    const msg = applyNotificationPolicy(
      {
        title: "Alpha",
        body: "Body",
        group: "Group",
      },
      {
        kind: "announcement",
        mode: "single",
        profile: "quiet",
      },
    );

    assert.equal(msg.level, "active");
    assert.equal(msg.call, 0);
  });

  it("lets aggressive profile increase notification intensity", () => {
    const msg = applyNotificationPolicy(
      {
        title: "Alpha",
        body: "Body",
        group: "Group",
      },
      {
        kind: "announcement",
        mode: "single",
        profile: "aggressive",
      },
    );

    assert.equal(msg.level, "critical");
    assert.equal(msg.call, 1);
  });

  it("preserves explicit level and call overrides", () => {
    const msg = applyNotificationPolicy(
      {
        title: "Alpha",
        body: "Body",
        group: "Group",
        level: "critical",
        call: 1,
      },
      { kind: "alpha", mode: "single", alphaTypes: ["tge_live"] },
    );

    assert.equal(msg.level, "critical");
    assert.equal(msg.call, 1);
  });
});
