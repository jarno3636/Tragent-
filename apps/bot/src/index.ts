import "dotenv/config";
import { startServer } from "./server.js";
import { readConfig } from "./config.js";
import { runTick } from "./strategy.js";

startServer();

async function loopOnce() {
  try {
    const cfg = readConfig();
    if (cfg.paused) {
      console.log("[tick] paused");
      return;
    }
    const r = await runTick(cfg);
    console.log(`[tick] ${r.ok ? "OK" : "ERR"}: ${r.msg}`);
  } catch (e) {
    console.error("[tick] exception", e);
  }
}

// run once on boot (will do nothing if paused)
loopOnce().catch(() => {});

function schedule() {
  const cfg = readConfig();
  const intervalMs = cfg.pollMinutes * 60_000;
  console.log(`Tick interval: ${cfg.pollMinutes} minutes`);
  setInterval(loopOnce, intervalMs);
}

schedule();
