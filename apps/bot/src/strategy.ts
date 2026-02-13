import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { checkPolicy, type ProposedTrade, type RuntimeConfig } from "@agent/core";
import { balanceOf, decimals } from "./erc20.js";
import { quote0x } from "./zerox.js";
import { appendTradeCsv, loadState, saveState } from "./storage.js";

export type TickResult = {
  ok: boolean;
  msg: string;
  snapshot?: any;
  proposed?: ProposedTrade | null;
};

function pickMostOffTarget(targets: Record<string, number>, actual: Record<string, number>) {
  let worstSym: string | null = null;
  let worstDelta = 0;
  for (const sym of Object.keys(targets)) {
    const d = (actual[sym] ?? 0) - targets[sym];
    if (Math.abs(d) > Math.abs(worstDelta)) {
      worstDelta = d;
      worstSym = sym;
    }
  }
  return { sym: worstSym, delta: worstDelta };
}

export async function runTick(cfg: RuntimeConfig): Promise<TickResult> {
  const rpcUrl = process.env.RPC_URL;
  const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!rpcUrl) return { ok: false, msg: "Missing RPC_URL" };
  if (!pk) return { ok: false, msg: "Missing PRIVATE_KEY" };

  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ chain: base, transport: http(rpcUrl), account });

  const symbols = Object.keys(cfg.allowTokens);
  // Ensure targets sum ~1
  const targetSum = Object.values(cfg.targets).reduce((a, b) => a + b, 0);
  if (Math.abs(targetSum - 1) > 0.02) {
    return { ok: false, msg: `Targets must sum to ~1. Current sum=${targetSum}` };
  }

  // Load balances + decimals
  const addrBySym = cfg.allowTokens as Record<string, `0x${string}`>;
  const decBySym: Record<string, number> = {};
  const balBySym: Record<string, bigint> = {};
  for (const sym of symbols) {
    decBySym[sym] = await decimals(publicClient, addrBySym[sym]);
    balBySym[sym] = await balanceOf(publicClient, addrBySym[sym], account.address);
  }

  // Price each token in USDC using 0x quotes (small sells)
  const usdcSym = "USDC";
  const usdcAddr = addrBySym[usdcSym];
  const usdcDec = decBySym[usdcSym];

  const priceUsd: Record<string, number> = { USDC: 1 };
  for (const sym of symbols) {
    if (sym === usdcSym) continue;
    const sellAddr = addrBySym[sym];
    const sellDec = decBySym[sym];
    // sell tiny amount: 0.01 WETH, 10 AERO, 100 DEGEN (heuristic)
    let testSellHuman = 0.01;
    if (sym === "AERO") testSellHuman = 10;
    if (sym === "DEGEN") testSellHuman = 100;

    const sellAmt = parseUnits(String(testSellHuman), sellDec);
    const q = await quote0x({ chainId: cfg.chainId, sellToken: sellAddr, buyToken: usdcAddr, sellAmount: sellAmt });
    const buyUsdc = Number(formatUnits(q.buyAmount, usdcDec));
    const p = buyUsdc / testSellHuman;
    if (!isFinite(p) || p <= 0) return { ok: false, msg: `Bad price for ${sym}` };
    priceUsd[sym] = p;
  }

  // Portfolio value + allocation
  const balHuman: Record<string, number> = {};
  const valueUsd: Record<string, number> = {};
  let portfolioUsd = 0;
  for (const sym of symbols) {
    const b = Number(formatUnits(balBySym[sym], decBySym[sym]));
    balHuman[sym] = b;
    const v = b * (priceUsd[sym] ?? 0);
    valueUsd[sym] = v;
    portfolioUsd += v;
  }
  const alloc: Record<string, number> = {};
  for (const sym of symbols) alloc[sym] = portfolioUsd > 0 ? valueUsd[sym] / portfolioUsd : 0;

  const snapshot = { address: account.address, balHuman, priceUsd, valueUsd, portfolioUsd, alloc, targets: cfg.targets };

  // State + drawdown stop
  const state = loadState();
  if (state.startValueUsd == null) {
    state.startValueUsd = portfolioUsd;
    saveState(state);
  }
  if (state.startValueUsd && portfolioUsd < state.startValueUsd * (1 - cfg.drawdownStopPct)) {
    return { ok: false, msg: `Drawdown stop triggered (>${cfg.drawdownStopPct*100}% down). Bot will not trade.`, snapshot };
  }

  // Find most off target
  const { sym: worstSym, delta: worstDelta } = pickMostOffTarget(cfg.targets, alloc);
  if (!worstSym) return { ok: true, msg: "No targets defined.", snapshot, proposed: null };

  if (Math.abs(worstDelta) < cfg.band) {
    return { ok: true, msg: "Within band. No trade.", snapshot, proposed: null };
  }

  // Decide: if delta positive => over-allocated => sell it into USDC
  // if delta negative => under-allocated => buy it using USDC
  const notionalUsd = cfg.maxTradeUsd;
  let proposed: ProposedTrade;
  if (worstDelta > 0) {
    proposed = { sellSymbol: worstSym, buySymbol: "USDC", notionalUsd, reason: `${worstSym} overweight by ${(worstDelta*100).toFixed(1)}%` };
  } else {
    proposed = { sellSymbol: "USDC", buySymbol: worstSym, notionalUsd, reason: `${worstSym} underweight by ${(-worstDelta*100).toFixed(1)}%` };
  }

  // Ensure we have enough balance for the sell side
  if (proposed.sellSymbol === "USDC") {
    if (balHuman.USDC < cfg.minTradeUsd) return { ok: true, msg: "Not enough USDC to buy.", snapshot, proposed };
  } else {
    const p = priceUsd[proposed.sellSymbol] || 0;
    if (p <= 0) return { ok: false, msg: "Bad price for sell token", snapshot, proposed };
    const needed = proposed.notionalUsd / p;
    if (balHuman[proposed.sellSymbol] < needed * 0.98) return { ok: true, msg: `Not enough ${proposed.sellSymbol} to sell.`, snapshot, proposed };
  }

  const nowMs = Date.now();
  const pol = checkPolicy(cfg, state, proposed, nowMs);
  if (!pol.ok) return { ok: true, msg: `Trade blocked by policy: ${pol.why}`, snapshot, proposed };

  // Build 0x swap tx
  const sellAddr = addrBySym[proposed.sellSymbol];
  const buyAddr = addrBySym[proposed.buySymbol];
  const sellDec = decBySym[proposed.sellSymbol];

  let sellAmount: bigint;
  if (proposed.sellSymbol === "USDC") {
    sellAmount = parseUnits(String(proposed.notionalUsd.toFixed(usdcDec)), usdcDec);
  } else {
    const p = priceUsd[proposed.sellSymbol];
    const sellHuman = proposed.notionalUsd / p;
    // 8 decimal clamp for safety
    sellAmount = parseUnits(sellHuman.toFixed(8), sellDec);
  }

  const q = await quote0x({
    chainId: cfg.chainId,
    sellToken: sellAddr,
    buyToken: buyAddr,
    sellAmount,
    takerAddress: account.address,
    slippageBps: cfg.maxSlippageBps
  });

  // Basic sanity: ensure quote isn't wildly off
  const estBuyUsd = proposed.buySymbol === "USDC"
    ? Number(formatUnits(q.buyAmount, usdcDec))
    : Number(formatUnits(q.buyAmount, decBySym[proposed.buySymbol])) * (priceUsd[proposed.buySymbol] ?? 0);

  if (estBuyUsd < proposed.notionalUsd * 0.90) {
    return { ok: true, msg: "Quote too poor (likely low liquidity / high impact). Skipping.", snapshot, proposed };
  }

  if (cfg.paused) {
    return { ok: true, msg: "PAUSED=true, not sending. (Dry run snapshot ready)", snapshot, proposed };
  }

  const hash = await walletClient.sendTransaction({
    to: q.to,
    data: q.data,
    value: q.value ?? 0n
  });

  // Update state + logs
  state.lastTradeAtMs = nowMs;
  state.tradesToday += 1;
  state.notionalTodayUsd += proposed.notionalUsd;
  saveState(state);

  appendTradeCsv({
    ts: new Date().toISOString(),
    hash,
    sellSymbol: proposed.sellSymbol,
    buySymbol: proposed.buySymbol,
    notionalUsd: proposed.notionalUsd,
    estBuyUsd: Number(estBuyUsd.toFixed(4)),
    reason: proposed.reason
  });

  return { ok: true, msg: `Trade sent: ${hash}`, snapshot, proposed };
}
