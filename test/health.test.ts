import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getHealthSnapshot,
  recordMonitorCount,
  recordMonitorError,
  recordMonitorState,
  recordNotifierResult,
  reportAlive,
  resetHealthState,
} from "../src/health.js";

describe("health snapshot", () => {
  afterEach(resetHealthState);

  it("collects monitor and notifier telemetry", () => {
    reportAlive("alpha-api");
    recordMonitorCount("alpha-api", "seen", 3);
    recordMonitorCount("alpha-api", "sent", 2);
    recordMonitorState("alpha-api", "polling");
    recordMonitorError("alpha-api", new Error("boom"));
    recordNotifierResult("bark", true);
    recordNotifierResult("bark", false, new Error("push failed"));

    const snapshot = getHealthSnapshot();

    assert.equal(snapshot.status, "ok");
    assert.ok(snapshot.monitors["alpha-api"]);
    assert.equal(snapshot.monitors["alpha-api"].counters.seen, 3);
    assert.equal(snapshot.monitors["alpha-api"].counters.sent, 2);
    assert.equal(snapshot.monitors["alpha-api"].state, "polling");
    assert.ok(snapshot.monitors["alpha-api"].stateUpdatedAt);
    assert.equal(snapshot.monitors["alpha-api"].lastError, "boom");
    assert.ok(snapshot.monitors["alpha-api"].lastActiveAt);
    assert.equal(snapshot.notifiers["bark"].success, 1);
    assert.equal(snapshot.notifiers["bark"].failure, 1);
    assert.equal(snapshot.notifiers["bark"].lastError, "push failed");
  });
});
