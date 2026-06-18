import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SettingsNav } from "@/components/settings/settings-nav";

/** 2-pane settings shell: fixed nav | scrollable content (UIP-20, FR-LAYOUT-2). */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
        <div className="px-4 pb-1 pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to chat
          </Link>
        </div>
        <h2 className="px-5 pb-2 pt-3 text-lg font-semibold">Settings</h2>
        <SettingsNav />
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
