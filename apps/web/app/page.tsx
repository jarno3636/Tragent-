"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_BOT_API_URL || "http://localhost:8787";
const TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

type StatusResp = any;

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      "x-admin-token": TOKEN,
      "content-type": "application/json"
    }
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || "request failed");
  return j;
}

export default function Page() {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cfg = status?.config;
  const snap = status?.dryRun?.snapshot;

  async function refresh() {
    setLoading(true); setErr(null);
    try {
      const s = await api("/status");
      setStatus(s);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const allocRows = useMemo(() => {
    if (!snap?.alloc || !cfg?.targets) return [];
    return Object.keys(cfg.targets).map((k: string) => ({
      sym: k,
      target: cfg.targets[k],
      actual: snap.alloc[k] ?? 0,
      valueUsd: snap.valueUsd?.[k] ?? 0
    }));
  }, [snap, cfg]);

  async function pause() { await api("/pause", { method: "POST" }); await refresh(); }
  async function resume() { await api("/resume", { method: "POST" }); await refresh(); }
  async function runOnce() { await api("/run-once", { method: "POST" }); await refresh(); }

  async function saveConfig(nextCfg: any) {
    await api("/config", { method: "POST", body: JSON.stringify(nextCfg) });
    await refresh();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={refresh} disabled={loading} style={btn()}>{loading ? "Refreshing…" : "Refresh"}</button>
        <button onClick={runOnce} disabled={loading} style={btn("solid")}>Run Once</button>
        {cfg?.paused ? (
          <button onClick={resume} disabled={loading} style={btn("green")}>Resume</button>
        ) : (
          <button onClick={pause} disabled={loading} style={btn("red")}>Pause</button>
        )}
      </div>

      {err && (
        <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,0,0,0.08)", border: "1px solid rgba(255,0,0,0.25)" }}>
          <div style={{ fontWeight: 700 }}>Error</div>
          <div style={{ opacity: 0.85, fontSize: 13 }}>{err}</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
            Check NEXT_PUBLIC_ADMIN_TOKEN + NEXT_PUBLIC_BOT_API_URL and that the bot is reachable.
          </div>
        </div>
      )}

      <div style={card()}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Status</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{cfg?.paused ? "PAUSED" : "ACTIVE"}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 10 }}>
          <Stat label="Portfolio (USD)" value={snap?.portfolioUsd?.toFixed?.(2) ?? "—"} />
          <Stat label="Address" value={snap?.address ? `${String(snap.address).slice(0, 6)}…${String(snap.address).slice(-4)}` : "—"} mono />
          <Stat label="Band" value={cfg?.band != null ? `${(cfg.band * 100).toFixed(1)}%` : "—"} />
          <Stat label="Max Trade / Day" value={cfg ? `$${cfg.maxTradeUsd} / $${cfg.maxDailyNotionalUsd}` : "—"} />
        </div>
      </div>

      <div style={card()}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Allocation</div>
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.8 }}>
                <th style={th()}>Token</th>
                <th style={th()}>Target</th>
                <th style={th()}>Actual</th>
                <th style={th()}>Value (USD)</th>
              </tr>
            </thead>
            <tbody>
              {allocRows.map((r: any) => {
                const diff = (r.actual - r.target);
                return (
                  <tr key={r.sym} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={td()}>{r.sym}</td>
                    <td style={td()}>{(r.target * 100).toFixed(1)}%</td>
                    <td style={td()}>{(r.actual * 100).toFixed(1)}% <span style={{ opacity: 0.7 }}>({diff >= 0 ? "+" : ""}{(diff*100).toFixed(1)}%)</span></td>
                    <td style={td()}>${Number(r.valueUsd).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={card()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Config (edit)</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Saved to bot config/runtime.json</div>
        </div>

        {cfg && (
          <ConfigEditor cfg={cfg} onSave={saveConfig} />
        )}
      </div>
    </div>
  );
}

function ConfigEditor({ cfg, onSave }: { cfg: any; onSave: (next: any) => Promise<void> }) {
  const [local, setLocal] = useState<any>(cfg);
  const [saving, setSaving] = useState(false);

  useEffect(() => setLocal(cfg), [cfg]);

  function set(path: string, val: any) {
    setLocal((p: any) => {
      const next = structuredClone(p);
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      cur[parts.at(-1)!] = val;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try { await onSave(local); } finally { setSaving(false); }
  }

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <Field label="Band (0.06 = 6%)">
          <input value={local.band} onChange={(e) => set("band", Number(e.target.value))} style={inp()} />
        </Field>
        <Field label="Poll minutes">
          <input value={local.pollMinutes} onChange={(e) => set("pollMinutes", Number(e.target.value))} style={inp()} />
        </Field>
        <Field label="Max trade USD">
          <input value={local.maxTradeUsd} onChange={(e) => set("maxTradeUsd", Number(e.target.value))} style={inp()} />
        </Field>
        <Field label="Max daily notional USD">
          <input value={local.maxDailyNotionalUsd} onChange={(e) => set("maxDailyNotionalUsd", Number(e.target.value))} style={inp()} />
        </Field>
        <Field label="Cooldown minutes">
          <input value={local.cooldownMinutes} onChange={(e) => set("cooldownMinutes", Number(e.target.value))} style={inp()} />
        </Field>
        <Field label="Max slippage (bps)">
          <input value={local.maxSlippageBps} onChange={(e) => set("maxSlippageBps", Number(e.target.value))} style={inp()} />
        </Field>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800 }}>Targets (must sum to ~1)</div>
        {Object.keys(local.targets).map((k) => (
          <div key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 70, opacity: 0.9 }}>{k}</div>
            <input value={local.targets[k]} onChange={(e) => set(`targets.${k}`, Number(e.target.value))} style={inp()} />
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving} style={btn("solid")}>{saving ? "Saving…" : "Save Config"}</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6, fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}>
        {value}
      </div>
    </div>
  );
}

function btn(kind: "ghost" | "solid" | "red" | "green" = "ghost") {
  const base = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e8eefc",
    cursor: "pointer",
    fontWeight: 800 as const,
    fontSize: 13
  };
  if (kind === "solid") return { ...base, background: "rgba(143,179,255,0.18)", border: "1px solid rgba(143,179,255,0.35)" };
  if (kind === "red") return { ...base, background: "rgba(255,90,90,0.15)", border: "1px solid rgba(255,90,90,0.35)" };
  if (kind === "green") return { ...base, background: "rgba(90,255,160,0.12)", border: "1px solid rgba(90,255,160,0.35)" };
  return base;
}

function card() {
  return {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.10)"
  } as const;
}

function th() { return { padding: "10px 8px" } as const; }
function td() { return { padding: "10px 8px" } as const; }
function inp() {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.35)",
    color: "#e8eefc",
    outline: "none"
  } as const;
}
