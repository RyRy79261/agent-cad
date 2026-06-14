import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import "./globals.css";

export const metadata: Metadata = {
  title: "agent-cad",
  description: "Agentic code-to-CAD & scan-to-mesh 3D printing control panel",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
            <Link href="/" className="text-lg font-bold tracking-tight">
              agent<span className="text-primary">-cad</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">Design</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/setup">Printer setup</Link>
              </Button>
              <ModeToggle />
            </nav>
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
