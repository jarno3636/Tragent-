import fs from "node:fs";
import path from "node:path";
import { dayKeyUTC, type RuntimeState } from "@agent/core";

const STATE_PATH = process.env.STATE_PATH || "/app/state/agent_state.json";
const TRADES_PATH = process.env.TRADES_PATH || "/app/state/trades.csv";

export function loadState(): RuntimeState {
  const today = dayKeyUTC();
  if (!fs.existsSync(STATE_PATH)) {
    return { dayKey: today, lastTradeAtMs: null, tradesToday: 0, notionalTodayUsd: 0, startValueUsd: null };
  }
  const s = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as RuntimeState;
  if (s.dayKey !== today) {
    return { ...s, dayKey: today, tradesToday: 0, notionalTodayUsd: 0 };
  }
  return s;
}

export function saveState(s: RuntimeState) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

export function appendTradeCsv(row: Record<string, string | number>) {
  fs.mkdirSync(path.dirname(TRADES_PATH), { recursive: true });
  const exists = fs.existsSync(TRADES_PATH);
  const headers = Object.keys(row);
  const line = headers.map((h) => String(row[h]).replaceAll(",", " ")).join(",") + "\n";
  if (!exists) {
    fs.writeFileSync(TRADES_PATH, headers.join(",") + "\n" + line);
  } else {
    fs.appendFileSync(TRADES_PATH, line);
  }
}
