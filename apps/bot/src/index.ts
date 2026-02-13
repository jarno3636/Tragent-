import "dotenv/config";
import { startServer } from "./server.js";
import { readConfig } from "./config.js";
import { runTick } from "./strategy.js";

startServer();

async function loop() {
  try {
    const cfg = readConfig();
    if (!cfg.paused) {
      const r = await runTick(cfg);
      console.log(`[tick] ${r.ok ? "OK" : "ERR"}: ${r.msg}`);
    } else {
      console.log("[tick] paused");
    }
  } catch (e) {
    console.error("[tick] exception", e);
  }
}

const cfg = readConfig();
const intervalMs = cfg.pollMinutes * 60_000;
setInterval(loop, intervalMs);
console.log(`Tick interval: ${cfg.pollMinutes} minutes`);
