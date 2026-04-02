import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { createChildLogger } from "./logger.js";

const log = createChildLogger("store");

interface StoreEntry<T> {
  value: T;
  createdAt: number;
}

export class PersistentStore<T = unknown> {
  private data = new Map<string, StoreEntry<T>>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ttlMs: number;
  private readonly flushDebounceMs: number;

  constructor(
    private readonly filePath: string,
    ttlDays = 30,
    flushDebounceMs = 500,
  ) {
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    this.flushDebounceMs = flushDebounceMs;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const entries: Record<string, StoreEntry<T>> = JSON.parse(raw);
      const now = Date.now();
      let pruned = 0;
      for (const [key, entry] of Object.entries(entries)) {
        if (
          entry &&
          typeof entry.createdAt === "number" &&
          now - entry.createdAt < this.ttlMs
        ) {
          this.data.set(key, entry);
        } else {
          pruned++;
        }
      }
      log.info({ file: this.filePath, loaded: this.data.size, pruned }, "store loaded");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        log.info({ file: this.filePath }, "store file not found, starting fresh");
      } else {
        const backupPath = `${this.filePath}.corrupt.${Date.now()}`;
        log.error(
          { err, file: this.filePath, backupPath },
          "store corrupted, backing up and starting fresh",
        );
        try {
          await rename(this.filePath, backupPath);
        } catch {
          /* best-effort backup */
        }
      }
    }
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  get(key: string): T | undefined {
    return this.data.get(key)?.value;
  }

  set(key: string, value: T): void {
    this.data.set(key, { value, createdAt: Date.now() });
    this.scheduleDiskFlush();
  }

  getAll(): Map<string, T> {
    const result = new Map<string, T>();
    for (const [k, v] of this.data) {
      result.set(k, v.value);
    }
    return result;
  }

  get size(): number {
    return this.data.size;
  }

  private scheduleDiskFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.dirty) {
        this.flush().catch((err) =>
          log.error({ err }, "background flush failed"),
        );
      }
    }, this.flushDebounceMs);
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    const obj: Record<string, StoreEntry<T>> = {};
    for (const [key, entry] of this.data) {
      obj[key] = entry;
    }
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(obj, null, 2), "utf-8");
    } catch (err) {
      log.error({ err }, "disk flush failed");
      this.dirty = true;
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
