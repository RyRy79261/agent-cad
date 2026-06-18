"use client";

import * as React from "react";
import { ArrowUp, Loader2, Smartphone, Cable, Cpu, Headphones } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const QUICK_STARTS = [
  { label: "A desk phone stand", icon: Smartphone },
  { label: "Cable clips for my desk", icon: Cable },
  { label: "A vented Raspberry Pi case", icon: Cpu },
  { label: "A headphone hook", icon: Headphones },
];

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  /** Receives the text to submit directly (avoids stale-state on quick-start chips). */
  onSubmit: (text: string) => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "hero" | "inline";
  placeholder?: string;
  className?: string;
}

/**
 * Prompt input. `hero` is the empty-state New Chat composer (with quick-start
 * chips, SCR-001/002); `inline` is the docked composer at the bottom of a thread.
 * Submit on Enter (Shift+Enter = newline); ≥3 chars required.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  disabled,
  variant = "inline",
  placeholder,
  className,
}: ComposerProps) {
  const canSubmit = value.trim().length >= 3 && !busy && !disabled;

  function submit() {
    if (canSubmit) onSubmit(value.trim());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const hero = variant === "hero";

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "relative flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:border-primary/60",
          hero && "p-3",
        )}
      >
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={hero ? 3 : 1}
          placeholder={placeholder ?? (hero ? "Describe the part you want to print…" : "Refine, or ask for changes…")}
          className="min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!canSubmit}
          className="h-9 w-9 shrink-0 rounded-xl"
          aria-label="Send"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>

      {hero ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {QUICK_STARTS.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              disabled={disabled || busy}
              onClick={() => {
                onChange(label);
                onSubmit(label);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
