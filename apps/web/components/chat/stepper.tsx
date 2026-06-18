import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { STEPS, currentStep } from "@/lib/chat";

/** DESCRIBE → INTERVIEW → GENERATE → SLICE & PRINT footer, derived from chat.status (FR-CHAT-12). */
export function Stepper({ status, className }: { status: string; className?: string }) {
  const current = currentStep(status);
  const done = status === "ready-to-print" ? STEPS.length : current;
  return (
    <ol className={cn("flex items-center gap-1 text-xs", className)}>
      {STEPS.map((label, i) => {
        const complete = i < done;
        const active = i === current && status !== "ready-to-print";
        return (
          <li key={label} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                complete && "bg-success/20 text-success",
                active && "bg-primary text-primary-foreground",
                !complete && !active && "bg-elevated text-subtle-foreground",
              )}
            >
              {complete ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn(active ? "text-foreground" : "text-subtle-foreground")}>{label}</span>
            {i < STEPS.length - 1 ? <span className="mx-1 text-subtle-foreground">→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
