import { config } from "../config.js";
import type { Notifier, NotifyMessage } from "../types.js";
import { getPool } from "../utils/http.js";
import { sleep } from "../utils/sleep.js";
import { createChildLogger } from "../utils/logger.js";
import { recordNotifierResult } from "../health.js";
import { clampBarkMessage } from "./message-limits.js";

const log = createChildLogger("bark");

const CF_CHALLENGE_HINT =
  "Cloudflare blocked this request (browser challenge). Use internal BARK_SERVER on the same Docker network, e.g. http://bark-server:8080";

function isCloudflareChallenge(statusCode: number, text: string): boolean {
  if (statusCode !== 403) return false;
  const t = text.slice(0, 8000);
  return (
    t.includes("Just a moment") ||
    t.includes("cdn-cgi/challenge") ||
    t.includes("cf-mitigated")
  );
}

function barkHttpError(statusCode: number, text: string): Error {
  if (isCloudflareChallenge(statusCode, text)) {
    return new Error(`bark http 403: ${CF_CHALLENGE_HINT}`);
  }
  const oneLine = text.replace(/\s+/g, " ").slice(0, 160);
  return new Error(`bark http ${statusCode}: ${oneLine || "(empty body)"}`);
}

function isNonRetryableBarkError(err: Error): boolean {
  return err.message.includes("Cloudflare blocked");
}

async function pushToDevice(
  key: string,
  msg: NotifyMessage,
  attempt = 0,
): Promise<void> {
  const pool = getPool(config.bark.server);
  const { icon, volume, badge, call, isArchive, maxRetries } = config.bark;
  const level = msg.level ?? config.bark.defaultLevel;
  const sound = msg.sound ?? config.bark.defaultSound;

  // Bark-server API V2: POST /push with device_key in JSON (path /:key + JSON is fragile behind some proxies).
  const payload: Record<string, unknown> = {
    device_key: key,
    title: msg.title,
    body: msg.body,
    group: msg.group,
    icon,
    sound,
    level,
    badge,
    volume: String(volume),
    call: String(msg.call ?? call),
    isArchive: String(isArchive),
    ...(msg.url ? { url: msg.url } : {}),
  };

  try {
    const { statusCode, body } = await pool.request({
      path: "/push",
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const text = await body.text();

    if (statusCode === 200) {
      let result: { code?: number; message?: string };
      try {
        result = JSON.parse(text) as { code?: number; message?: string };
      } catch {
        if (text.includes("Just a moment") || text.includes("cdn-cgi/challenge")) {
          throw new Error(`bark invalid response: ${CF_CHALLENGE_HINT}`);
        }
        throw new Error(
          `bark invalid json (http 200): ${text.replace(/\s+/g, " ").slice(0, 160)}`,
        );
      }
      if (result.code === 200) {
        log.info({ key: key.slice(0, 6) + "..." }, "bark push ok");
        return;
      }
      throw new Error(`bark api error: ${result.message ?? "unknown"}`);
    }
    throw barkHttpError(statusCode, text);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (attempt < maxRetries - 1 && !isNonRetryableBarkError(e)) {
      const delay = 500 * 2 ** attempt;
      log.warn({ err: e, attempt, delay }, "bark push retry");
      await sleep(delay);
      return pushToDevice(key, msg, attempt + 1);
    }
    log.error({ err: e, key: key.slice(0, 6) + "..." }, "bark push failed after retries");
    throw e;
  }
}

export class BarkNotifier implements Notifier {
  readonly name = "bark";

  async send(message: NotifyMessage): Promise<void> {
    const safeMessage = clampBarkMessage(message);
    const results = await Promise.allSettled(
      config.bark.keys.map((key) => pushToDevice(key, safeMessage)),
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length === results.length) {
      throw new Error("all bark devices failed");
    }
    if (failures.length > 0) {
      recordNotifierResult(
        this.name,
        false,
        new Error(`partial bark failure (${failures.length}/${results.length})`),
      );
      log.warn(
        { failed: failures.length, total: results.length },
        "partial bark failure",
      );
    }
  }
}
