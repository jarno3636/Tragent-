import express from "express";
import cors from "cors";
import { readConfig, writeConfig } from "./config.js";
import { runTick } from "./strategy.js";

function auth(req: express.Request) {
  const cfg = readConfig();
  const token = (req.headers["x-admin-token"] as string | undefined) || (req.query.token as string | undefined);
  return token && token === cfg.adminToken;
}

export function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/config", (req, res) => {
    if (!auth(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    res.json({ ok: true, config: readConfig() });
  });

  app.post("/config", (req, res) => {
    if (!auth(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    writeConfig(req.body);
    res.json({ ok: true, config: readConfig() });
  });

  app.post("/pause", (req, res) => {
    if (!auth(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const cfg = readConfig();
    const next = { ...cfg, paused: true };
    writeConfig(next);
    res.json({ ok: true, config: readConfig() });
  });

  app.post("/resume", (req, res) => {
    if (!auth(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const cfg = readConfig();
    const next = { ...cfg, paused: false };
    writeConfig(next);
    res.json({ ok: true, config: readConfig() });
  });

  app.post("/run-once", async (req, res) => {
    if (!auth(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const cfg = readConfig();
    const result = await runTick(cfg);
    res.json({ ok: true, result });
  });

  app.get("/status", async (req, res) => {
    if (!auth(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const cfg = readConfig();
    const result = await runTick({ ...cfg, paused: true }); // dry run snapshot
    res.json({ ok: true, config: cfg, dryRun: result });
  });

  const port = Number(process.env.PORT || 8787);
  app.listen(port, () => console.log(`Bot API listening on :${port}`));
}
