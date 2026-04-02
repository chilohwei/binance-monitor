import { Pool } from "undici";
import { createChildLogger } from "./logger.js";

const log = createChildLogger("http");
const pools = new Map<string, Pool>();

export function getPool(origin: string): Pool {
  let pool = pools.get(origin);
  if (!pool) {
    pool = new Pool(origin, {
      connections: 10,
      pipelining: 1,
      keepAliveTimeout: 60_000,
      headersTimeout: 15_000,
      bodyTimeout: 15_000,
    });
    pools.set(origin, pool);
  }
  return pool;
}

export async function closeAllPools(): Promise<void> {
  const results = await Promise.allSettled(
    Array.from(pools.entries()).map(async ([origin, pool]) => {
      try {
        await pool.close();
      } catch (err) {
        log.warn({ err, origin }, "pool close error");
      }
    }),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      log.warn({ err: r.reason }, "unexpected pool close error");
    }
  }
  pools.clear();
}
