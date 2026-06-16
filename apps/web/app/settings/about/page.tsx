"use client";

import * as React from "react";
import Link from "next/link";

import * as api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/section";

/** About (SCR-029): app identity + a live API health check. Informational. */
export default function AboutPage() {
  const [health, setHealth] = React.useState<"checking" | "ok" | "down">("checking");

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${api.API_URL}/health`);
        setHealth(res.ok ? "ok" : "down");
      } catch {
        setHealth("down");
      }
    })();
  }, []);

  return (
    <SettingsSection title="About" description="Agent CAD — local-first prompt → CAD → slice → print.">
      <Card className="space-y-3 p-5 text-sm">
        <Row label="App" value="Agent CAD" />
        <Row label="Target printer" value="Creality Ender 5 S1" />
        <Row label="API" value={api.API_URL} mono />
        <Row
          label="API health"
          value={health === "checking" ? "Checking…" : health === "ok" ? "Healthy" : "Unreachable"}
          tone={health === "ok" ? "success" : health === "down" ? "danger" : undefined}
        />
      </Card>
      <p className="text-xs text-subtle-foreground">
        New to the printer?{" "}
        <Link href="/setup" className="text-primary hover:underline">
          Hardware setup guide
        </Link>
      </p>
    </SettingsSection>
  );
}

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "success" | "danger";
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={[
          mono ? "font-mono text-xs" : "",
          tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
