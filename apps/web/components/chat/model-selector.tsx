"use client";

import type { Settings } from "@agent-cad/types";
import { Sparkles, ChevronDown, Gauge } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Models offered for generation. Aliases also work, but full ids are unambiguous. */
const MODELS: { id: string; label: string }[] = [
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const cap = (s: string) => (s === "xhigh" ? "xHigh" : s.charAt(0).toUpperCase() + s.slice(1));

/**
 * Compact model + effort picker (design's composer model chip, SCR-005). Writes the
 * global `settings.active_model` / `settings.effort` that drive generate / interview /
 * refine — a faster model or lower effort is the lever for slow generations.
 */
export function ModelSelector({
  model,
  effort,
  onChange,
  disabled,
}: {
  model: string;
  effort: string;
  onChange: (patch: Partial<Settings>) => void;
  disabled?: boolean;
}) {
  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={disabled} title="Model & effort">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium">{modelLabel}</span>
          <span className="text-subtle-foreground">· {cap(effort)}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Model
        </DropdownMenuLabel>
        {MODELS.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.id}
            checked={m.id === model}
            onCheckedChange={() => onChange({ active_model: m.id })}
          >
            {m.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5" /> Effort
        </DropdownMenuLabel>
        {EFFORTS.map((e) => (
          <DropdownMenuCheckboxItem
            key={e}
            checked={e === effort}
            onCheckedChange={() => onChange({ effort: e })}
          >
            {cap(e)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
