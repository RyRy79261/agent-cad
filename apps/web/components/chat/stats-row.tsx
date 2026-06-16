import { Clock, Ruler, Weight, Layers } from "lucide-react";

import { cn } from "@/lib/utils";
import { type SliceStats, formatPrintTime } from "@/lib/chat";

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-elevated px-2 py-2 text-center">
      <Icon className="h-4 w-4 text-subtle-foreground" />
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-subtle-foreground">{label}</span>
    </div>
  );
}

/** Print time / filament length / weight / layer count (FR-CHAT-8 / FR-RES-2). */
export function StatsRow({ stats, className }: { stats: SliceStats | null; className?: string }) {
  const len = stats?.length_m;
  const wt = stats?.weight_g;
  const layers = stats?.layer_count;
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      <Stat icon={Clock} label="Time" value={formatPrintTime(stats?.print_time_s)} />
      <Stat icon={Ruler} label="Filament" value={len ? `${len.toFixed(1)} m` : "—"} />
      <Stat icon={Weight} label="Weight" value={wt ? `${wt.toFixed(0)} g` : "—"} />
      <Stat icon={Layers} label="Layers" value={layers ? String(layers) : "—"} />
    </div>
  );
}
