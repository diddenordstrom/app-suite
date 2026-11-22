/** GET /t/:tid/events — Server-Sent Events carrying ChangeEvent JSON (D11). */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { EventBus } from "../events";
import type { AppEnv } from "../viewer";

const HEARTBEAT_MS = 25_000;

export function eventRoutes(bus: EventBus, heartbeatMs = HEARTBEAT_MS) {
  const app = new Hono<AppEnv>();

  app.get("/events", (c) => {
    const tid = c.get("tid");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      let ended!: () => void;
      const done = new Promise<void>((r) => (ended = r));
      const off = bus.subscribe(tid, (ev) => {
        stream.writeSSE({ data: JSON.stringify(ev) }).catch(() => ended());
      });
      stream.onAbort(() => ended());
      try {
        await stream.write(": connected\n\n");
        while (!stream.aborted && !stream.closed) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const tick = new Promise<"tick">((r) => (timer = setTimeout(() => r("tick"), heartbeatMs)));
          const res = await Promise.race([tick, done]);
          clearTimeout(timer);
          if (res !== "tick") break;
          await stream.write(": ping\n\n");
        }
      } finally {
        off();
      }
    });
  });

  return app;
}
