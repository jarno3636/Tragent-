import express from "express";
import cors from "cors";

import { readConfig, writeConfig } from "./config.js";
import { dryRunTick, runTick } from "./strategy.js";

function isAuthed(req: express.Request): boolean {
  const cfg = readConfig();
  const token =
    (req.headers["x-admin-token"] as string | undefined) ||
    (req.query.token as string | undefined);
  return !!token && token === cfg.adminToken;
}

export function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/config", (req, res) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    return res.json({ ok: true, config: readConfig() });
  });

  app.post("/config", (req, res) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const next = writeConfig(req.body);
    return res.json({ ok: true, config: next });
  });

  app.post("/pause", (req, res) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const cfg = readConfig();
    const next = writeConfig({ ...cfg, paused: true });
    return res.json({ ok: true, config: next });
  });

  app.post("/resume", (req, res) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const cfg = readConfig();
    const next = writeConfig({ ...cfg, paused: false });
    return res.json({ ok: true, config: next });
  });

  app.get("/status", async (req, res) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const cfg = readConfig();
    const dry = await dryRunTick();
    return res.json({ ok: true, config: cfg, dryRun: dry });
  });

  app.post("/run-once", async (req, res) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const cfg = readConfig();
    const result = await runTick(cfg);
    return res.json({ ok: true, result });
  });

  const port = Number(process.env.PORT || 8787);
  app.listen(port, () => console.log(`Bot API listening on :${port}`));
}
