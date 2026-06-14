import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "agent-cad",
  description: "Agentic code-to-CAD & scan-to-mesh 3D printing control panel",
};

const navLink: React.CSSProperties = { color: "#b5732a", textDecoration: "none", fontWeight: 600 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid #eee",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <Link href="/" style={{ fontWeight: 700, fontSize: "1.1rem", color: "#222", textDecoration: "none" }}>
            agent-cad
          </Link>
          <nav style={{ display: "flex", gap: 18, fontSize: "0.9rem" }}>
            <Link href="/" style={navLink}>
              Design
            </Link>
            <Link href="/setup" style={navLink}>
              Printer setup
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
