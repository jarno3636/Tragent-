import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseUnits,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import { readConfig } from "./config.js";
import { appendTradeCsv, loadState, saveState } from "./storage.js";
import { balanceOf, decimals, allowance, ERC20_ABI } from "./erc20.js";
import { quote0x } from "./zerox.js";
import { checkPolicy, type ProposedTrade, type RuntimeConfig } from "./core.js";

type TickResult = {
  ok: boolean;
  msg: string;
  snapshot?: any;
  proposed?: ProposedTrade | null;
  txHash?: Hex;
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

  // IMPORTANT:
  // Base (OP stack) introduces "deposit" tx types. Some viem/ts combos cause
  // type-level incompatibilities when PublicClient is inferred too strictly.
  // This is a typing issue only. Runtime is fine. Force to `any`.
  const publicClient: any = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient: any = createWalletClient({ chain: base, transport: http(rpcUrl), account });

  const symbols = Object.keys(cfg.allowTokens);
  const addrBySym = cfg.allowTokens as Record<string, `0x${string}`>;

  // sanity: targets sum ~1
  const targetSum = Object.values(cfg.targets).reduce((a, b) => a + b, 0);
  if (Math.abs(targetSum - 1) > 0.02) {
    return { ok: false, msg: `Targets must sum to ~1 (got ${targetSum}).`, proposed: null };
  }

  // decimals + balances
  const decBySym: Record<string, number> = {};
  const balBySym: Record<string, bigint> = {};

  for (const sym of symbols) {
    decBySym[sym] = await decimals(publicClient, addrBySym[sym]);
    balBySym[sym] = await balanceOf(publicClient, addrBySym[sym], account.address);
  }

  // price in USDC via small 0x quotes
  const usdcSym = "USDC";
  if (!addrBySym[usdcSym]) return { ok: false, msg: "USDC must be in allowTokens.", proposed: null };

  const usdcAddr = addrBySym.USDC;
  const usdcDec = decBySym.USDC;

  const priceUsd: Record<string, number> = { USDC: 1 };

  for (const sym of symbols) {
    if (sym === "USDC") continue;

    // heuristic probe sizes
    let testSellHuman = 0.01;
    if (sym === "AERO") testSellHuman = 10;
    if (sym === "DEGEN") testSellHuman = 100;
    if (sym === "WETH") testSellHuman = 0.01;

    const sellAmt = parseUnits(String(testSellHuman), decBySym[sym]);

    const q = await quote0x({
      chainId: cfg.chainId,
      sellToken: addrBySym[sym],
      buyToken: usdcAddr,
      sellAmount: sellAmt,
      takerAddress: account.address,
      slippageBps: 100 // probe doesn't need strict
    });

    const buyUsdc = Number(formatUnits(q.buyAmount, usdcDec));
    const p = buyUsdc / testSellHuman;

    if (!isFinite(p) || p <= 0) return { ok: false, msg: `Bad price for ${sym}`, proposed: null };
    priceUsd[sym] = p;
  }

  // portfolio values + alloc
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

  const snapshot = {
    address: account.address,
    portfolioUsd,
    balHuman,
    priceUsd,
    valueUsd,
    alloc,
    targets: cfg.targets,
    paused: cfg.paused
  };

  // state + drawdown stop
  const state = loadState();
  if (state.startValueUsd == null) {
    state.startValueUsd = portfolioUsd;
    saveState(state);
  }

  if (state.startValueUsd && portfolioUsd < state.startValueUsd * (1 - cfg.drawdownStopPct)) {
    return {
      ok: false,
      msg: `Drawdown stop triggered (>${cfg.drawdownStopPct * 100}% down). Trading disabled.`,
      snapshot,
      proposed: null
    };
  }

  // choose worst drift
  const { sym: worstSym, delta: worstDelta } = pickMostOffTarget(cfg.targets, alloc);
  if (!worstSym) return { ok: true, msg: "No targets.", snapshot, proposed: null };

  if (Math.abs(worstDelta) < cfg.band) {
    return { ok: true, msg: "Within band. No trade.", snapshot, proposed: null };
  }

  // propose trade toward target
  const notionalUsd = cfg.maxTradeUsd;

  let proposed: ProposedTrade;
  if (worstDelta > 0) {
    // overweight => sell into USDC
    proposed = {
      sellSymbol: worstSym,
      buySymbol: "USDC",
      notionalUsd,
      reason: `${worstSym} overweight by ${(worstDelta * 100).toFixed(1)}%`
    };
  } else {
    // underweight => buy with USDC
    proposed = {
      sellSymbol: "USDC",
      buySymbol: worstSym,
      notionalUsd,
      reason: `${worstSym} underweight by ${(-worstDelta * 100).toFixed(1)}%`
    };
  }

  // ensure balance exists to sell
  if (proposed.sellSymbol === "USDC") {
    if (balHuman.USDC < cfg.minTradeUsd) {
      return { ok: true, msg: "Not enough USDC to buy.", snapshot, proposed };
    }
  } else {
    const p = priceUsd[proposed.sellSymbol] || 0;
    if (p <= 0) return { ok: false, msg: "Bad price for sell token", snapshot, proposed };
    const needed = proposed.notionalUsd / p;
    if (balHuman[proposed.sellSymbol] < needed * 0.98) {
      return { ok: true, msg: `Not enough ${proposed.sellSymbol} to sell.`, snapshot, proposed };
    }
  }

  const nowMs = Date.now();
  const pol = checkPolicy(cfg, state, proposed, nowMs);
  if (!pol.ok) return { ok: true, msg: `Trade blocked by policy: ${pol.why}`, snapshot, proposed };

  // compute sellAmount
  const sellAddr = addrBySym[proposed.sellSymbol];
  const buyAddr = addrBySym[proposed.buySymbol];
  const sellDec = decBySym[proposed.sellSymbol];

  let sellAmount: bigint;
  if (proposed.sellSymbol === "USDC") {
    sellAmount = parseUnits(proposed.notionalUsd.toFixed(6), usdcDec);
  } else {
    const p = priceUsd[proposed.sellSymbol];
    const sellHuman = proposed.notionalUsd / p;
    sellAmount = parseUnits(sellHuman.toFixed(8), sellDec);
  }

  // get real quote with strict slippage
  const q = await quote0x({
    chainId: cfg.chainId,
    sellToken: sellAddr,
    buyToken: buyAddr,
    sellAmount,
    takerAddress: account.address,
    slippageBps: cfg.maxSlippageBps
  });

  // sanity: ensure quote isn't terrible (>12% impact)
  const buyUsd =
    proposed.buySymbol === "USDC"
      ? Number(formatUnits(q.buyAmount, usdcDec))
      : Number(formatUnits(q.buyAmount, decBySym[proposed.buySymbol])) * (priceUsd[proposed.buySymbol] ?? 0);

  if (buyUsd < proposed.notionalUsd * 0.88) {
    return { ok: true, msg: "Quote too poor (likely impact). Skipping.", snapshot, proposed };
  }

  // if paused, do not send
  if (cfg.paused) {
    return { ok: true, msg: "PAUSED=true (dry run only).", snapshot, proposed };
  }

  // ensure allowance for allowanceTarget (0x)
  const spender = (q.allowanceTarget || q.to) as `0x${string}`;
  const current = await allowance(publicClient, sellAddr, account.address, spender);

  if (current < sellAmount) {
    // approve EXACT sellAmount (no infinite approvals)
    const approveHash = await walletClient.writeContract({
      address: sellAddr,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, sellAmount]
    });

    // wait a bit for mining
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  // execute swap
  const txHash: Hex = await walletClient.sendTransaction({
    to: q.to,
    data: q.data,
    value: q.value ?? 0n
  });

  // update state + logs
  state.lastTradeAtMs = nowMs;
  state.tradesToday += 1;
  state.notionalTodayUsd += proposed.notionalUsd;
  saveState(state);

  appendTradeCsv({
    ts: new Date().toISOString(),
    txHash,
    sellSymbol: proposed.sellSymbol,
    buySymbol: proposed.buySymbol,
    notionalUsd: proposed.notionalUsd,
    estBuyUsd: Number(buyUsd.toFixed(4)),
    reason: proposed.reason
  });

  return { ok: true, msg: `Trade sent: ${txHash}`, snapshot, proposed, txHash };
}

export async function dryRunTick(): Promise<TickResult> {
  const cfg = readConfig();
  return runTick({ ...cfg, paused: true });
}
