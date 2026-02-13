export const metadata = { title: "Base Agent Wallet Dashboard" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#0b0f19", color: "#e8eefc" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Base Agent Wallet</div>
              <div style={{ opacity: 0.75, fontSize: 13 }}>USDC / WETH / AERO / DEGEN • Safety-first experiment</div>
            </div>
            <a href="https://basescan.org" target="_blank" rel="noreferrer" style={{ color: "#8fb3ff", textDecoration: "none", fontSize: 13 }}>BaseScan ↗</a>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
