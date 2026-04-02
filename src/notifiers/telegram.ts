import { config } from "../config.js";
import type { Notifier, NotifyMessage } from "../types.js";
import { getPool } from "../utils/http.js";
import { sleep } from "../utils/sleep.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("telegram");

function formatHtml(msg: NotifyMessage): string {
  let text = `<b>${escapeHtml(msg.title)}</b>\n\n${escapeHtml(msg.body)}`;
  if (msg.url) {
    text += `\n\n<a href="${escapeHtml(msg.url)}">${escapeHtml(msg.url)}</a>`;
  }
  return text;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendMessage(text: string, attempt = 0): Promise<void> {
  const pool = getPool("https://api.telegram.org");
  const { maxRetries } = config.telegram;

  const payload = {
    chat_id: config.telegram.chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: config.telegram.disablePreview,
    disable_notification: config.telegram.disableNotification,
  };

  try {
    const { statusCode, body } = await pool.request({
      path: `/bot${config.telegram.botToken}/sendMessage`,
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const raw = await body.text();

    if (statusCode === 200) {
      log.info("telegram push ok");
      return;
    }

    if (statusCode === 429 && attempt < maxRetries - 1) {
      let retryAfter = 5000;
      try {
        const parsed = JSON.parse(raw);
        retryAfter = (parsed?.parameters?.retry_after ?? 5) * 1000;
      } catch {
        /* use default */
      }
      log.warn({ retryAfter }, "telegram rate limited, waiting");
      await sleep(retryAfter);
      return sendMessage(text, attempt + 1);
    }

    throw new Error(`telegram http ${statusCode}: ${raw}`);
  } catch (err) {
    if (attempt < maxRetries - 1) {
      const delay = 1000 * 2 ** attempt;
      log.warn({ err, attempt, delay }, "telegram push retry");
      await sleep(delay);
      return sendMessage(text, attempt + 1);
    }
    log.error({ err }, "telegram push failed after retries");
    throw err;
  }
}

export class TelegramNotifier implements Notifier {
  readonly name = "telegram";

  async send(message: NotifyMessage): Promise<void> {
    const html = formatHtml(message);
    await sendMessage(html);
  }
}
