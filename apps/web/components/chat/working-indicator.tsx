"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";

/** "1m 23s" / "45s". */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/** A live, ticking elapsed counter from a start timestamp (ms). */
export function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{formatElapsed((now - startedAt) / 1000)}</span>;
}

/**
 * The "AI is working" row in the thread — an assistant-styled bubble with a spinner,
 * a label, and a live elapsed timer so you can see it's running and how long it's taken.
 */
export function WorkingIndicator({ label, startedAt }: { label: string; startedAt: number }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-2.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{label}…</span>
        <span className="text-subtle-foreground">
          · <ElapsedTimer startedAt={startedAt} />
        </span>
      </div>
    </div>
  );
}
