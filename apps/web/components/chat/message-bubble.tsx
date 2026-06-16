"use client";

import type { Message } from "@agent-cad/types";
import { Sparkles, User } from "lucide-react";

import { cn } from "@/lib/utils";

/** One chat turn. Assistant narration is templated server-side (§3.10); we just render it.
 * Quick-reply chips are surfaced as a dedicated row above the composer, not per-bubble. */
export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
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
      <div className={cn("flex max-w-[80%] flex-col gap-2", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
