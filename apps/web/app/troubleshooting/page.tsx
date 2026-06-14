import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type Fix, type Impact, type Severity, SYMPTOMS, type Symptom } from "./data";

export const metadata = {
  title: "Cube troubleshooting · agent-cad",
  description:
    "Read your calibration cube and fix the common Ender 5 S1 / OrcaSlicer print defects — corner bulging, ringing, first-layer, dimensional accuracy and more.",
};

export default function TroubleshootingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20 pt-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Calibration · diagnose &amp; fix</p>
      <h1 className="mb-2 mt-1 text-3xl font-bold tracking-tight">Read your calibration cube</h1>
      <p className="text-lg text-muted-foreground">
        Print a cube, then match what you see to a row below. Each fix names the exact OrcaSlicer setting (or
        calibration test) and is specific to your <strong className="text-foreground">Ender 5 S1</strong>. New
        here? Do the{" "}
        <Link href="/setup" className="font-semibold text-primary hover:underline">
          one-time printer setup
        </Link>{" "}
        first.
      </p>

      <div className="my-5 rounded-lg border border-sky-500/50 bg-sky-500/10 p-4 text-sm">
        <p className="mb-1 font-semibold">📐 Measure it first (calipers)</p>
        Measure X, Y and Z at 2–3 spots each, <em>avoiding the embossed letters and the bottom 3 layers</em>.
        Target <strong>20.00 mm</strong>; anything in <strong>19.85–20.15 mm is good</strong> for a stock Ender —
        stop tuning and print real parts. Also measure both top diagonals: if they’re unequal, the cube is{" "}
        <em>skewed</em> (see below).
      </div>

      <div className="my-5 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
        <p className="mb-1 font-semibold">⚠️ The “ribbing” at corners is corner bulging</p>
        It’s the slicer dumping a little extra plastic at each corner — not “too much acceleration.” The full cure
        (pressure advance) needs custom firmware, which we’re <strong>not</strong> doing. Instead the committed
        profile already lowers wall speed and tightens wall precision, which is the best fix without a firmware
        flash. A little residual corner bulge is normal and cosmetic.{" "}
        <a href="#corner-bulging" className="font-semibold text-primary hover:underline">
          Details ↓
        </a>
      </div>

      {/* jump nav */}
      <nav className="my-6 rounded-lg border bg-muted/40 p-4">
        <p className="mb-2 text-sm font-semibold">Jump to a symptom</p>
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {SYMPTOMS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary hover:underline">
                {s.symptom}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-5">
        {SYMPTOMS.map((s) => (
          <SymptomCard key={s.id} s={s} />
        ))}
      </div>

      <p className="mt-8">
        <Link href="/" className="font-semibold text-primary hover:underline">
          ← Back to designing parts
        </Link>
      </p>
    </main>
  );
}

function SymptomCard({ s }: { s: Symptom }) {
  return (
    <Card id={s.id} className="scroll-mt-6 p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{s.symptom}</h2>
        <SeverityBadge severity={s.severity} />
      </div>
      {s.alsoCalled.length ? (
        <p className="mb-3 text-xs text-muted-foreground">also called: {s.alsoCalled.join(" · ")}</p>
      ) : null}

      <H3>What you see</H3>
      <P>{s.whatYouSee}</P>

      {s.note ? (
        <div className="my-3 rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm">
          ✅ {s.note}
        </div>
      ) : null}

      <H3>Likely causes</H3>
      <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
        {s.rootCauses.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>

      <H3>Fixes</H3>
      <div className="space-y-2">
        {s.fixes.map((f, i) => (
          <FixRow key={i} f={f} />
        ))}
      </div>

      <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
        <span className="font-semibold">Best calibration test:</span> {s.primaryTest}
      </div>
    </Card>
  );
}

function FixRow({ f }: { f: Fix }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ImpactBadge impact={f.impact} />
        <span className="font-medium">{f.action}</span>
      </div>
      <p className="mt-1 text-xs font-medium text-primary">{f.where}</p>
      <p className="mt-1 text-sm text-muted-foreground">{f.detail}</p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, string> = {
    cosmetic: "border-transparent bg-secondary text-secondary-foreground",
    dimensional: "border-amber-500/50 bg-amber-500/10 text-foreground",
    structural: "border-orange-500/50 bg-orange-500/10 text-foreground",
    critical: "border-destructive/50 bg-destructive/10 text-foreground",
  };
  return <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium capitalize", map[severity])}>{severity}</span>;
}

function ImpactBadge({ impact }: { impact: Impact }) {
  const label = impact === "high" ? "High impact" : impact === "medium" ? "Medium" : "Minor";
  const variant = impact === "high" ? "default" : impact === "medium" ? "secondary" : "outline";
  return <Badge variant={variant}>{label}</Badge>;
}

const P = ({ children }: { children: ReactNode }) => <p className="text-sm leading-relaxed">{children}</p>;
const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
);
