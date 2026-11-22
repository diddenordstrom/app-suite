export interface Config {
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3300);
  if (!Number.isInteger(port) || port <= 0) throw new Error("PORT must be a positive integer");
  return { port };
}
