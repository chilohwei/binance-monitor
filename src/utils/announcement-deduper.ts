import { PersistentStore } from "./store.js";

export interface AnnouncementDedupSource {
  catalogId: number;
  title: string;
  code?: string;
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export function announcementDedupKey(source: AnnouncementDedupSource): string {
  if (source.code) {
    return `announcement:code:${source.code}`;
  }
  return `announcement:text:${source.catalogId}:${normalizeTitle(source.title)}`;
}

export class AnnouncementDeduper {
  private readonly store: PersistentStore<boolean>;
  private readonly reserved = new Set<string>();
  private loaded = false;
  private closed = false;

  constructor(
    filePath: string,
    ttlDays: number,
    flushDebounceMs: number,
  ) {
    this.store = new PersistentStore(filePath, ttlDays, flushDebounceMs);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    await this.store.load();
    this.loaded = true;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.reserved.clear();
    await this.store.close();
  }

  get size(): number {
    return this.store.size;
  }

  has(key: string): boolean {
    return this.store.has(key) || this.reserved.has(key);
  }

  claim(key: string): boolean {
    if (this.has(key)) return false;
    this.reserved.add(key);
    return true;
  }

  confirm(key: string): void {
    this.reserved.delete(key);
    this.store.set(key, true);
  }

  release(key: string): void {
    this.reserved.delete(key);
  }
}
