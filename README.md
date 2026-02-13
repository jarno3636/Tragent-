# Base Agent Wallet Bot (USDC / WETH / AERO / DEGEN)

A minimal, safety-first **agent wallet experiment** for Base that:
- runs a **multi-asset rebalancer**
- enforces **hard policy limits** (per-trade, per-day, cooldown, allowlist)
- exposes a small **HTTP API** for pause/config/run
- ships a **Next.js dashboard** to view status + edit config + pause

> This is an experiment. Use small disposable funds only.

## What runs where?
This repo is designed to be deployed (since you said you can't run locally):
- **apps/bot**: long-running Node service (does the trading + API)
- **apps/web**: Next.js dashboard (calls bot API)

## Quick deploy (Docker on a VPS)
1. Copy this repo to a server that has Docker.
2. Create `.env` in `apps/bot` (see `.env.example`).
3. Create `.env.local` in `apps/web` (see `.env.local.example`).
4. Run:
   ```bash
   docker compose up -d --build
   ```

Bot API: `http://YOUR_SERVER:8787`
Web UI: `http://YOUR_SERVER:3000`

## Safety model (important)
The AI/agent does not directly sign arbitrary calls. The bot:
- only trades **allowlisted tokens**
- only swaps through **0x swap API**
- blocks trades if they violate policy (caps, cooldown, slippage)
- has a kill switch: `PAUSED=true`

## Tokens (Base mainnet)
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- WETH: 0x4200000000000000000000000000000000000006
- AERO: 0x940181a94A35A4569E4529A3CDfB74e38FD98631
- DEGEN: 0x4ed4E862860bED51A9570b96D89aF5E1B0Efefed

## Notes
- For $50, keep trade caps small. This default setup uses $10 per trade, $20/day cap, 45m cooldown.
- This bot uses WETH (not native ETH) for clean DEX plumbing.
