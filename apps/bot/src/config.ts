import fs from "node:fs";
import path from "node:path";
import { RuntimeConfigSchema, type RuntimeConfig } from "@agent/core";

const CONFIG_PATH = process.env.CONFIG_PATH || "/app/config/runtime.json";

export function readConfig(): RuntimeConfig {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  // env overrides
  const adminToken = process.env.ADMIN_TOKEN || parsed.adminToken;
  const pausedEnv = process.env.PAUSED;
  const paused = pausedEnv ? pausedEnv.toLowerCase() === "true" : parsed.paused;
  return RuntimeConfigSchema.parse({ ...parsed, adminToken, paused });
}

export function writeConfig(next: unknown) {
  const cfg = RuntimeConfigSchema.parse(next);
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
