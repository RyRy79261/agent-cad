"use client";

import type { Message } from "@agent-cad/types";
import { Sparkles, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatElapsed } from "./working-indicator";

/** "2:34 PM" from a Unix-seconds timestamp; empty for the optimistic ts=0 placeholder. */
function formatTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const compact = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** "14.2k in · 3.1k out" from the message's token usage (input incl. cache + output). */
function formatTokens(usage?: Record<string, number> | null): string | null {
  if (!usage) return null;
  // Input = fresh + cache-creation + cache-read (the big system prompt is cached input).
  const inTok = (usage.input_tokens ?? 0) + (usage.cache_creation_tokens ?? 0) + (usage.cache_read_tokens ?? 0);
  const outTok = usage.output_tokens ?? 0;
  if (!inTok && !outTok) return null;
  return `${compact(inTok)} in · ${compact(outTok)} out`;
}

/** One chat turn. Assistant narration is templated server-side (§3.10); we just render it.
 * Quick-reply chips are surfaced as a dedicated row above the composer, not per-bubble. */
export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const time = formatTime(message.ts);
  const tokens = isUser ? null : formatTokens(message.usage);
  const duration = !isUser && message.duration_ms ? formatElapsed(message.duration_ms / 1000) : null;
  const hasMeta = time || tokens || duration;

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-elevated text-muted-foreground" : "bg-primary/15 text-primary",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div className={cn("flex max-w-[80%] flex-col gap-1", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
          )}
        >
          {message.content}
        </div>
        {hasMeta ? (
          <div
            className={cn(
              "flex items-center gap-1.5 px-1 text-[11px] text-subtle-foreground",
              isUser && "flex-row-reverse",
            )}
          >
            {time ? <span>{time}</span> : null}
            {duration ? <span>· {duration}</span> : null}
            {tokens ? <span>· {tokens} tokens</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
