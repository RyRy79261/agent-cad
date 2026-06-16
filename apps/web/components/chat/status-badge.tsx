import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/chat";

const TONE: Record<string, string> = {
  new: "bg-elevated text-muted-foreground",
  interviewing: "bg-accent-muted text-accent-bright",
  interviewed: "bg-accent-muted text-accent-bright",
  generating: "bg-accent-muted text-accent-bright",
  "model-ready": "bg-accent-muted text-accent-bright",
  "ready-to-print": "bg-success-muted text-success",
};

/** Small pill mirroring `chat.status` in the header (FR-CHAT-12). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE[status] ?? TONE.new,
        className,
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
