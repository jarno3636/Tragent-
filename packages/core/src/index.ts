import { z } from "zod";

export const RuntimeConfigSchema = z.object({
  chainId: z.number(),
  paused: z.boolean(),
  adminToken: z.string().min(8),
  targets: z.record(z.number().min(0).max(1)),
  band: z.number().min(0).max(0.5),
  maxTradeUsd: z.number().positive(),
  minTradeUsd: z.number().positive().default(5),
  maxDailyNotionalUsd: z.number().positive(),
  maxTradesPerDay: z.number().int().positive(),
  cooldownMinutes: z.number().int().positive(),
  maxSlippageBps: z.number().int().min(1).max(500),
  pollMinutes: z.number().int().min(1).max(1440),
  drawdownStopPct: z.number().min(0).max(0.9).default(0.2),
  allowTokens: z.record(z.string().regex(/^0x[a-fA-F0-9]{40}$/)),
  quote: z.object({ provider: z.literal("0x") })
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export type ProposedTrade = {
  sellSymbol: string;
  buySymbol: string;
  notionalUsd: number; // approximate
  reason: string;
};

export type RuntimeState = {
  dayKey: string; // YYYY-MM-DD (UTC)
  lastTradeAtMs: number | null;
  tradesToday: number;
  notionalTodayUsd: number;
  startValueUsd: number | null;
};

export function dayKeyUTC(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function checkPolicy(
  cfg: RuntimeConfig,
  state: RuntimeState,
  trade: ProposedTrade,
  nowMs: number
): { ok: true } | { ok: false; why: string } {
  if (cfg.paused) return { ok: false, why: "paused" };
  if (trade.notionalUsd < cfg.minTradeUsd) return { ok: false, why: "below minTradeUsd" };
  if (trade.notionalUsd > cfg.maxTradeUsd) return { ok: false, why: "exceeds maxTradeUsd" };
  if (state.notionalTodayUsd + trade.notionalUsd > cfg.maxDailyNotionalUsd) return { ok: false, why: "exceeds maxDailyNotionalUsd" };
  if (state.tradesToday + 1 > cfg.maxTradesPerDay) return { ok: false, why: "exceeds maxTradesPerDay" };

  if (state.lastTradeAtMs) {
    const mins = (nowMs - state.lastTradeAtMs) / 60000;
    if (mins < cfg.cooldownMinutes) return { ok: false, why: `cooldown ${mins.toFixed(1)}m < ${cfg.cooldownMinutes}m` };
  }

  const allowed = new Set(Object.keys(cfg.allowTokens));
  if (!allowed.has(trade.sellSymbol) || !allowed.has(trade.buySymbol)) {
    return { ok: false, why: "token not allowlisted" };
  }
  return { ok: true };
}
