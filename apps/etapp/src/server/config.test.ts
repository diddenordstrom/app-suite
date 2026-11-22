import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("refuses dev auth in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", AUTH_MODE: "dev" } as NodeJS.ProcessEnv)).toThrow();
  });
  it("requires oidc settings", () => {
    expect(() => loadConfig({ AUTH_MODE: "oidc" } as NodeJS.ProcessEnv)).toThrow();
  });
  it("keeps photos next to the database unless told otherwise", () => {
    expect(loadConfig({ DATABASE_PATH: "/data/app.db" } as NodeJS.ProcessEnv).uploadsDir).toBe("/data/uploads");
    expect(loadConfig({ UPLOADS_DIR: "/srv/photos" } as NodeJS.ProcessEnv).uploadsDir).toBe("/srv/photos");
  });
});
