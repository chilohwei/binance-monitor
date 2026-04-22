import type { NotifyMessage } from "../types.js";

export const BARK_TITLE_LIMIT = 160;
export const BARK_BODY_LIMIT = 2400;
export const BARK_GROUP_LIMIT = 80;
export const TELEGRAM_TEXT_LIMIT = 4096;

const BARK_TRUNCATED_SUFFIX = "\n\n... (truncated)";
const TELEGRAM_CONTINUED_LABEL = "（续）";
const PREFERRED_BREAKS = [
  "\n\n",
  "\n",
  "。 ",
  "！ ",
  "？ ",
  ". ",
  "! ",
  "? ",
  "，",
  "、",
  ", ",
  " ",
] as const;

function rewindOutOfHtmlEntity(text: string, index: number): number {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  const ampIndex = text.lastIndexOf("&", safeIndex - 1);
  if (ampIndex === -1) return safeIndex;

  const semiIndex = text.lastIndexOf(";", safeIndex - 1);
  return semiIndex > ampIndex ? safeIndex : ampIndex;
}

function trimChunkEnd(chunk: string): string {
  return chunk.replace(/[ \t\r\n]+$/u, "");
}

function trimChunkStart(chunk: string): string {
  return chunk.replace(/^[ \t\r\n]+/u, "");
}

function findSoftBreak(text: string, maxLength: number): number {
  if (text.length <= maxLength) return text.length;

  const minPreferred = Math.max(1, Math.floor(maxLength * 0.6));

  for (const token of PREFERRED_BREAKS) {
    const index = text.lastIndexOf(token, maxLength - 1);
    if (index >= minPreferred) {
      return index + token.length;
    }
  }

  return maxLength;
}

function takeChunk(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  let end = findSoftBreak(text, maxLength);
  end = rewindOutOfHtmlEntity(text, end);
  let chunk = trimChunkEnd(text.slice(0, end));
  if (chunk.length > 0) {
    return chunk;
  }

  end = rewindOutOfHtmlEntity(text, maxLength);
  chunk = trimChunkEnd(text.slice(0, end));
  if (chunk.length > 0) {
    return chunk;
  }

  return text.slice(0, maxLength);
}

function truncateText(text: string, limit: number, suffix: string): string {
  if (text.length <= limit) return text;
  if (limit <= suffix.length) return suffix.slice(0, limit);

  const head = takeChunk(text, limit - suffix.length);
  return `${trimChunkEnd(head)}${suffix}`;
}

export function clampBarkMessage(message: NotifyMessage): NotifyMessage {
  return {
    ...message,
    title: truncateText(message.title, BARK_TITLE_LIMIT, "..."),
    body: truncateText(message.body, BARK_BODY_LIMIT, BARK_TRUNCATED_SUFFIX),
    group: truncateText(message.group, BARK_GROUP_LIMIT, "..."),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTelegramTitle(title: string, continued: boolean): string {
  const text = continued ? `${title} ${TELEGRAM_CONTINUED_LABEL}` : title;
  return `<b>${escapeHtml(text)}</b>`;
}

export function formatTelegramMessages(message: NotifyMessage): string[] {
  const escapedBody = escapeHtml(message.body);
  const link = message.url
    ? `<a href="${escapeHtml(message.url)}">${escapeHtml(message.url)}</a>`
    : "";

  const chunks: string[] = [];
  let remaining = escapedBody;
  let linkPending = link.length > 0;

  while (remaining.length > 0 || linkPending || chunks.length === 0) {
    const continued = chunks.length > 0;
    const prefix = `${formatTelegramTitle(message.title, continued)}\n\n`;
    let budget = TELEGRAM_TEXT_LIMIT - prefix.length;

    if (!remaining && linkPending) {
      const linkText = chunks.length === 0 ? link : link.replace(/^\n\n/u, "");
      if (prefix.length + linkText.length > TELEGRAM_TEXT_LIMIT) {
        throw new Error("telegram link block exceeds max message length");
      }
      chunks.push(`${prefix}${linkText}`);
      linkPending = false;
      continue;
    }

    if (budget <= 0) {
      throw new Error("telegram message prefix exceeds max message length");
    }

    const linkSuffix = linkPending ? `\n\n${link}` : "";
    if (remaining.length <= budget - linkSuffix.length) {
      chunks.push(`${prefix}${remaining}${linkSuffix}`);
      remaining = "";
      linkPending = false;
      continue;
    }

    const bodyChunk = takeChunk(remaining, budget);
    if (bodyChunk.length === 0) {
      throw new Error("telegram message chunking failed");
    }

    chunks.push(`${prefix}${bodyChunk}`);
    remaining = trimChunkStart(remaining.slice(bodyChunk.length));
  }

  return chunks;
}
