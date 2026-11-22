import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("refuses dev auth in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", AUTH_MODE: "dev" } as NodeJS.ProcessEnv)).toThrow();
  });
  it("requires oidc settings", () => {
    expect(() => loadConfig({ AUTH_MODE: "oidc" } as NodeJS.ProcessEnv)).toThrow();
  });
  it("never takes demo as an auth mode from the environment", () => {
    expect(() => loadConfig({ AUTH_MODE: "demo" } as NodeJS.ProcessEnv)).toThrow();
  });
});
