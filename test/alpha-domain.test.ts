import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALPHA_EVENT_TYPES,
  dedupeAlphaEventTypes,
  isAlphaPriorityEvent,
} from "../src/domain/alpha.js";

describe("alpha domain", () => {
  it("exposes the known alpha event types in stable order", () => {
    assert.deepEqual(ALPHA_EVENT_TYPES, [
      "new_token",
      "airdrop_live",
      "tge_live",
    ]);
  });

  it("dedupes alpha event types while preserving order", () => {
    assert.deepEqual(
      dedupeAlphaEventTypes(["new_token", "airdrop_live", "new_token"]),
      ["new_token", "airdrop_live"],
    );
  });

  it("marks live alpha events as priority", () => {
    assert.equal(isAlphaPriorityEvent("airdrop_live"), true);
    assert.equal(isAlphaPriorityEvent("tge_live"), true);
    assert.equal(isAlphaPriorityEvent("new_token"), false);
  });
});
