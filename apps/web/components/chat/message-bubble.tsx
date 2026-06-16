"use client";

import type { Message } from "@agent-cad/types";
import { Sparkles, User } from "lucide-react";

import { cn } from "@/lib/utils";

/** One chat turn. Assistant narration is templated server-side (§3.10); we just render it. */
export function MessageBubble({
  message,
  onQuickReply,
}: {
  message: Message;
  onQuickReply?: (reply: string) => void;
}) {
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
        {message.quick_replies?.length ? (
          <div className="flex flex-wrap gap-2">
            {message.quick_replies.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => onQuickReply?.(reply)}
                className="rounded-full border border-border-strong bg-elevated px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {reply}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
