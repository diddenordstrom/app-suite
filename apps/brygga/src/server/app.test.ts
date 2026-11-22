import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";

describe("server", () => {
  it("answers the health check", async () => {
    const res = await createApp().request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("reads the port from the environment and rejects nonsense", () => {
    expect(loadConfig({} as NodeJS.ProcessEnv).port).toBe(3400);
    expect(loadConfig({ PORT: "3000" } as NodeJS.ProcessEnv).port).toBe(3000);
    expect(() => loadConfig({ PORT: "abc" } as NodeJS.ProcessEnv)).toThrow();
  });
});
