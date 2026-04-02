import { config } from "../config.js";
import type { Notifier, NotifyMessage } from "../types.js";
import { getPool } from "../utils/http.js";
import { sleep } from "../utils/sleep.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("bark");

async function pushToDevice(
  key: string,
  msg: NotifyMessage,
  attempt = 0,
): Promise<void> {
  const pool = getPool(config.bark.server);
  const { icon, volume, badge, call, isArchive, maxRetries } = config.bark;
  const level = msg.level ?? config.bark.defaultLevel;
  const sound = msg.sound ?? config.bark.defaultSound;

  const payload = {
    title: msg.title,
    body: msg.body,
    group: msg.group,
    icon,
    sound,
    level,
    volume,
    badge,
    call,
    isArchive,
    ...(msg.url ? { url: msg.url } : {}),
  };

  try {
    const { statusCode, body } = await pool.request({
      path: `/${key}`,
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const text = await body.text();

    if (statusCode === 200) {
      const result = JSON.parse(text);
      if (result.code === 200) {
        log.info({ key: key.slice(0, 6) + "..." }, "bark push ok");
        return;
      }
      throw new Error(`bark api error: ${result.message}`);
    }
    throw new Error(`bark http ${statusCode}: ${text}`);
  } catch (err) {
    if (attempt < maxRetries - 1) {
      const delay = 500 * 2 ** attempt;
      log.warn({ err, attempt, delay }, "bark push retry");
      await sleep(delay);
      return pushToDevice(key, msg, attempt + 1);
    }
    log.error({ err, key: key.slice(0, 6) + "..." }, "bark push failed after retries");
    throw err;
  }
}

export class BarkNotifier implements Notifier {
  readonly name = "bark";

  async send(message: NotifyMessage): Promise<void> {
    const results = await Promise.allSettled(
      config.bark.keys.map((key) => pushToDevice(key, message)),
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length === results.length) {
      throw new Error("all bark devices failed");
    }
    if (failures.length > 0) {
      log.warn(
        { failed: failures.length, total: results.length },
        "partial bark failure",
      );
    }
  }
}
