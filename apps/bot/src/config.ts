import fs from "node:fs";
import path from "node:path";
import { RuntimeConfigSchema, type RuntimeConfig } from "./core.js";

function firstExisting(paths: string[]): string {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0]!;
}

export function getConfigPath(): string {
  // Railway can set a working directory. Support multiple likely locations.
  const env = process.env.CONFIG_PATH;
  const candidates = [
    env,
    path.resolve(process.cwd(), "config/runtime.json"),
    path.resolve(process.cwd(), "../config/runtime.json"),
    path.resolve(process.cwd(), "../../config/runtime.json"),
    path.resolve(process.cwd(), "runtime.json")
  ].filter(Boolean) as string[];

  return firstExisting(candidates);
}

export function readConfig(): RuntimeConfig {
  const cfgPath = getConfigPath();
  const raw = fs.readFileSync(cfgPath, "utf-8");
  const parsed = JSON.parse(raw);

  const adminToken = process.env.ADMIN_TOKEN || parsed.adminToken;
  const pausedEnv = process.env.PAUSED;
  const paused = pausedEnv ? pausedEnv.toLowerCase() === "true" : parsed.paused;

  return RuntimeConfigSchema.parse({
    ...parsed,
    adminToken,
    paused
  });
}

export function writeConfig(next: unknown): RuntimeConfig {
  const cfgPath = getConfigPath();
  const validated = RuntimeConfigSchema.parse(next);
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(validated, null, 2));
  return validated;
}
