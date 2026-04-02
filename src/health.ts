import { createServer, type Server } from "node:http";
import { createChildLogger } from "./utils/logger.js";

const log = createChildLogger("health");

const monitorStatus = new Map<string, number>();

export function reportAlive(name: string): void {
  monitorStatus.set(name, Date.now());
}

let server: Server | null = null;

export function startHealthServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      if (req.url === "/health" || req.url === "/") {
        const monitors: Record<string, { lastActiveAt: string; agoMs: number }> =
          {};
        const now = Date.now();
        for (const [name, ts] of monitorStatus) {
          monitors[name] = {
            lastActiveAt: new Date(ts).toISOString(),
            agoMs: now - ts,
          };
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            uptime: Math.floor(process.uptime()),
            monitors,
          }),
        );
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
