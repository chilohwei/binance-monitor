import type { Notifier, NotifyMessage } from "../types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("dispatcher");

export class NotifyDispatcher {
  constructor(private readonly notifiers: Notifier[]) {}

  /**
   * Broadcast to all notifiers concurrently.
   * Throws AggregateError only when ALL notifiers fail (at-least-once semantics).
   */
  async broadcast(message: NotifyMessage): Promise<void> {
    const results = await Promise.allSettled(
      this.notifiers.map((n) => n.send(message)),
    );

    const errors: Error[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === "rejected") {
        const err =
          r.reason instanceof Error ? r.reason : new Error(String(r.reason));
        errors.push(err);
        log.error(
          { notifier: this.notifiers[i]!.name, err: r.reason },
          "notifier broadcast failed",
        );
      }
    }

    if (errors.length > 0 && errors.length === results.length) {
      throw new AggregateError(errors, "all notifiers failed");
    }
  }
}
