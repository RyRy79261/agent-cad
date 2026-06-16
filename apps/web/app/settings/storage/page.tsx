"use client";

import * as React from "react";
import type { Settings } from "@agent-cad/types";
import { FolderOpen, MessageSquare, Box, Layers, HardDrive } from "lucide-react";

import * as api from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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

function SectionHead({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function StoragePage() {
  const [usage, setUsage] = React.useState<Usage | null>(null);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [u, s] = await Promise.all([api.storageUsage(), api.getSettings()]);
      setUsage(u);
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const root = settings?.storage_location ?? "~/.agent-cad";
  const autoClear = (settings?.auto_clear_days ?? 0) > 0;

  async function openFolder() {
    try {
      const r = await api.revealStorage();
      setNote(r.ok ? "Opened the storage folder." : `Folder: ${r.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleAutoClear(on: boolean) {
    if (!settings) return;
    try {
      const next = await api.updateSettings({ ...settings, auto_clear_days: on ? 30 : 0 });
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Storage &amp; Data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage where Agent CAD keeps your projects, models, and g-code — and reclaim space when you need it.
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {note ? <p className="text-sm text-success">{note}</p> : null}

      {/* Storage location */}
      <section className="space-y-3">
        <SectionHead title="Storage location" description="Where Agent CAD saves generated models and g-code on this device." />
        <Card className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 truncate font-mono text-sm">{root}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={openFolder}>
              Open folder
            </Button>
            <Button variant="outline" size="sm" disabled title="Changing the location is coming soon">
              Change
            </Button>
          </div>
        </Card>
      </section>

      {/* Usage */}
      <section className="space-y-3">
        <SectionHead title="Usage" description="How much space Agent CAD is currently using on disk." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {usage ? (
            <>
              <UsageCard icon={MessageSquare} label="Projects & chats" value={String(usage.chats)} />
              <UsageCard icon={Box} label="Models" value={String(usage.models)} />
              <UsageCard icon={Layers} label="G-code slices" value={String(usage.slices)} />
              <UsageCard icon={HardDrive} label="Disk used" value={formatBytes(usage.bytes_used)} />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[72px]" />)
          )}
        </div>
      </section>

      {/* Data management */}
      <section className="space-y-3">
        <SectionHead
          title="Data management"
          description="Free up space or reset Agent CAD. Destructive actions can't be undone."
        />
        <Row title="Clear cached artifacts" body="Delete regenerable geometry (STL/g-code). Keeps your model source and chats.">
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
        <Row
          title="Auto-clear artifacts older than 30 days"
          body="Automatically remove cached artifacts after a month."
        >
          <Switch checked={autoClear} onCheckedChange={toggleAutoClear} disabled={!settings} />
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
        <Row title="Reset all data" body="Wipe chats, printers, and imports, reset settings, and re-seed the Ender 5 S1 + PLA.">
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
      </section>
    </div>
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
