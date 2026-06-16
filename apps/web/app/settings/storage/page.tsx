"use client";

import * as React from "react";
import { FolderOpen, MessageSquare, Box, Layers, HardDrive, Loader2 } from "lucide-react";

import * as api from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsSection } from "@/components/settings/section";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";

type Usage = Awaited<ReturnType<typeof api.storageUsage>>;

function UsageCard({ icon: Icon, label, value }: { icon: typeof Box; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-subtle-foreground">{label}</div>
      </div>
    </Card>
  );
}

export default function StoragePage() {
  const [usage, setUsage] = React.useState<Usage | null>(null);
  const [root, setRoot] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [u, s] = await Promise.all([api.storageUsage(), api.getSettings()]);
      setUsage(u);
      setRoot(s.storage_location ?? "~/.agent-cad");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <SettingsSection title="Storage & Data" description="Where Agent CAD keeps your chats, models, and slices.">
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-xs text-subtle-foreground">Storage location</div>
            <div className="truncate font-mono text-sm">{root ?? "…"}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {usage ? (
          <>
            <UsageCard icon={MessageSquare} label="Chats" value={String(usage.chats)} />
            <UsageCard icon={Box} label="Models" value={String(usage.models)} />
            <UsageCard icon={Layers} label="Slices" value={String(usage.slices)} />
            <UsageCard icon={HardDrive} label="Disk used" value={formatBytes(usage.bytes_used)} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[72px]" />)
        )}
      </div>

      {note ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {note}
        </p>
      ) : null}

      <div className="space-y-3 border-t pt-5">
        <h2 className="text-sm font-semibold">Maintenance</h2>
        <Row
          title="Clear cached artifacts"
          body="Delete regenerable geometry (STL/g-code). Keeps your model source and chats."
        >
          <ConfirmDialog
            trigger={<Button variant="outline" size="sm">Clear cache</Button>}
            title="Clear cached artifacts?"
            description="This deletes generated STL and g-code. Your chats and model source are kept; geometry regenerates on demand."
            confirmLabel="Clear cache"
            onConfirm={async () => {
              const { bytes_freed } = await api.clearArtifacts();
              setNote(`Freed ${formatBytes(bytes_freed)} of cached artifacts.`);
              await load();
            }}
          />
        </Row>
        <Row title="Clear chat history" body="Remove every chat and its artifacts. This cannot be undone.">
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" disabled={!usage || usage.chats === 0}>
                Clear history
              </Button>
            }
            title="Clear all chat history?"
            description="Every chat and its artifacts will be permanently deleted."
            confirmLabel="Delete all chats"
            destructive
            onConfirm={async () => {
              const { removed } = await api.clearChats();
              setNote(`Removed ${removed} chat${removed === 1 ? "" : "s"}.`);
              await load();
            }}
          />
        </Row>
        <Row
          title="Reset all data"
          body="Wipe chats, printers, and imports, reset settings, and re-seed the Ender 5 S1 + PLA."
        >
          <ConfirmDialog
            trigger={<Button variant="destructive" size="sm">Reset everything</Button>}
            title="Reset all data?"
            description="This wipes chats, printers, and imports, resets settings to defaults, and re-seeds the Ender 5 S1 with a PLA profile. This cannot be undone."
            confirmLabel="Reset everything"
            destructive
            onConfirm={async () => {
              await api.resetStore();
              setNote("All data reset and re-seeded.");
              await load();
            }}
          />
        </Row>
      </div>
    </SettingsSection>
  );
}

function Row({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
