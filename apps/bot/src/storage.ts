import fs from "node:fs";
import { dayKeyUTC, type RuntimeState } from "./core.js";

const STATE_FILE = process.env.STATE_FILE || "state.json";
const TRADES_FILE = process.env.TRADES_FILE || "trades.csv";

export function loadState(): RuntimeState {
  const today = dayKeyUTC();
  if (!fs.existsSync(STATE_FILE)) {
    return {
      dayKey: today,
      lastTradeAtMs: null,
      tradesToday: 0,
      notionalTodayUsd: 0,
      startValueUsd: null
    };
  }

  const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as RuntimeState;

  if (s.dayKey !== today) {
    return { ...s, dayKey: today, tradesToday: 0, notionalTodayUsd: 0 };
  }

  return s;
}

export function saveState(s: RuntimeState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

export function appendTradeCsv(row: Record<string, string | number>) {
  const exists = fs.existsSync(TRADES_FILE);
  const headers = Object.keys(row);
  const line = headers.map((h) => String(row[h]).replaceAll(",", " ")).join(",") + "\n";

  if (!exists) {
    fs.writeFileSync(TRADES_FILE, headers.join(",") + "\n" + line);
  } else {
    fs.appendFileSync(TRADES_FILE, line);
  }
}
