import { createServer, type Server } from "node:http";
import { createChildLogger } from "./utils/logger.js";

const log = createChildLogger("health");

const monitorStatus = new Map<string, number>();
export type MonitorCounterKey =
  | "seen"
  | "filtered"
  | "deduped"
  | "seeded"
  | "sent"
  | "failed"
  | "polls";

interface MonitorMetrics {
  counters: Record<MonitorCounterKey, number>;
  lastErrorAt?: number;
  lastError?: string;
  state?: string;
  stateUpdatedAt?: number;
}

interface NotifierMetrics {
  success: number;
  failure: number;
  lastErrorAt?: number;
  lastError?: string;
}

const monitorMetrics = new Map<string, MonitorMetrics>();
const notifierMetrics = new Map<string, NotifierMetrics>();

function ensureMonitorMetrics(name: string): MonitorMetrics {
  let metrics = monitorMetrics.get(name);
  if (!metrics) {
    metrics = {
      counters: {
        seen: 0,
        filtered: 0,
        deduped: 0,
        seeded: 0,
        sent: 0,
        failed: 0,
        polls: 0,
      },
    };
    monitorMetrics.set(name, metrics);
  }
  return metrics;
}

function ensureNotifierMetrics(name: string): NotifierMetrics {
  let metrics = notifierMetrics.get(name);
  if (!metrics) {
    metrics = { success: 0, failure: 0 };
    notifierMetrics.set(name, metrics);
  }
  return metrics;
}

export function reportAlive(name: string): void {
  monitorStatus.set(name, Date.now());
}

export function recordMonitorCount(
  name: string,
  counter: MonitorCounterKey,
  amount = 1,
): void {
  const metrics = ensureMonitorMetrics(name);
  metrics.counters[counter] += amount;
}

export function recordMonitorError(
  name: string,
  err: unknown,
  amount = 1,
): void {
  const metrics = ensureMonitorMetrics(name);
  metrics.counters.failed += amount;
  metrics.lastErrorAt = Date.now();
  metrics.lastError = err instanceof Error ? err.message : String(err);
}

export function recordMonitorState(name: string, state: string): void {
  const metrics = ensureMonitorMetrics(name);
  metrics.state = state;
  metrics.stateUpdatedAt = Date.now();
}

export function recordNotifierResult(
  name: string,
  ok: boolean,
  err?: unknown,
): void {
  const metrics = ensureNotifierMetrics(name);
  if (ok) {
    metrics.success += 1;
    return;
  }

  metrics.failure += 1;
  metrics.lastErrorAt = Date.now();
  metrics.lastError = err instanceof Error ? err.message : String(err);
}

export function resetHealthState(): void {
  monitorStatus.clear();
  monitorMetrics.clear();
  notifierMetrics.clear();
}

export function getHealthSnapshot() {
  const now = Date.now();
  const monitors: Record<
    string,
    {
      lastActiveAt: string | null;
      agoMs: number | null;
      counters: Record<MonitorCounterKey, number>;
      state?: string;
      stateUpdatedAt?: string;
      lastErrorAt?: string;
      lastError?: string;
    }
  > = {};

  for (const [name, ts] of monitorStatus) {
    const metrics = ensureMonitorMetrics(name);
    monitors[name] = {
      lastActiveAt: new Date(ts).toISOString(),
      agoMs: now - ts,
      counters: { ...metrics.counters },
      ...(metrics.state ? { state: metrics.state } : {}),
      ...(metrics.stateUpdatedAt
        ? { stateUpdatedAt: new Date(metrics.stateUpdatedAt).toISOString() }
        : {}),
      ...(metrics.lastErrorAt
        ? { lastErrorAt: new Date(metrics.lastErrorAt).toISOString() }
        : {}),
      ...(metrics.lastError ? { lastError: metrics.lastError } : {}),
    };
  }

  for (const [name, metrics] of monitorMetrics) {
    if (monitors[name]) continue;
    monitors[name] = {
      lastActiveAt: null,
      agoMs: null,
      counters: { ...metrics.counters },
      ...(metrics.state ? { state: metrics.state } : {}),
      ...(metrics.stateUpdatedAt
        ? { stateUpdatedAt: new Date(metrics.stateUpdatedAt).toISOString() }
        : {}),
      ...(metrics.lastErrorAt
        ? { lastErrorAt: new Date(metrics.lastErrorAt).toISOString() }
        : {}),
      ...(metrics.lastError ? { lastError: metrics.lastError } : {}),
    };
  }

  const notifiers: Record<
    string,
    {
      success: number;
      failure: number;
      lastErrorAt?: string;
      lastError?: string;
    }
  > = {};

  for (const [name, metrics] of notifierMetrics) {
    notifiers[name] = {
      success: metrics.success,
      failure: metrics.failure,
      ...(metrics.lastErrorAt
        ? { lastErrorAt: new Date(metrics.lastErrorAt).toISOString() }
        : {}),
      ...(metrics.lastError ? { lastError: metrics.lastError } : {}),
    };
  }

  return {
    status: "ok",
    uptime: Math.floor(process.uptime()),
    monitors,
    notifiers,
  };
}

let server: Server | null = null;

export function startHealthServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      if (req.url === "/health" || req.url === "/") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(getHealthSnapshot()));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.on("error", reject);
    server.listen(port, () => {
      log.info({ port }, "health server listening");
      resolve();
    });
  });
}

export function stopHealthServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
    server = null;
  });
}
