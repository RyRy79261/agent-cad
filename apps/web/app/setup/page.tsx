import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Printer setup · agent-cad",
  description: "First-time setup for the Creality Ender 5 S1 — leveling, Z-offset and your first print.",
};

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20 pt-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">One-time setup · ~30–45 min</p>
      <h1 className="mb-2 mt-1 text-3xl font-bold tracking-tight">Set up your Ender 5 S1</h1>
      <p className="text-lg text-muted-foreground">
        Do these once before your first print. The big one is{" "}
        <strong className="text-foreground">leveling the bed</strong> — getting the nozzle the same tiny
        distance from the plate everywhere. Get that right and most problems disappear.
      </p>

      <Step n={1} title="Assemble & check the nozzle">
        <P>
          The Ender 5 S1 ships mostly built — mount the gantry, screen and spool holder per the printed
          manual (~30 min). Plug in and power on.
        </P>
        <Callout kind="warn">
          The Sprite hotend uses a <strong>longer nozzle than a standard MK8</strong>. If you ever replace
          it, buy the correct <em>long</em> high-temp 0.4&nbsp;mm nozzle — a short MK8 leaves a gap that
          oozes and clogs.
        </Callout>
      </Step>

      <Step n={2} title="Load the filament">
        <Ol>
          <li>
            On the screen, <strong>preheat</strong> the nozzle (PLA ≈ 200&nbsp;°C).
          </li>
          <li>Cut the filament tip at an angle, feed it through the extruder until it grips and pushes.</li>
          <li>Keep feeding until clean plastic flows out of the nozzle, then wipe the blob away.</li>
        </Ol>
      </Step>

      <Step n={3} title="Level the bed — the important one">
        <P>
          “Leveling” really means setting the same small nozzle-to-bed gap everywhere. It’s two stages, then
          a live tweak on your first layer.
        </P>
        <H3>A · Manual (paper) leveling</H3>
        <Ol>
          <li>
            From the leveling menu, <strong>home</strong> the printer — the nozzle goes to the centre.
          </li>
          <li>
            Slide a sheet of <strong>A4 paper</strong> between nozzle and bed. Adjust until you feel{" "}
            <strong>light drag</strong> on the paper (about 0.1&nbsp;mm).
          </li>
          <li>
            Move to each of the <strong>4 corners</strong>. At each, turn that corner’s big knob (under the
            bed) until the paper has the same light drag.
          </li>
          <li>
            <strong>Repeat the corners 2–3 times</strong> — adjusting one slightly changes the others.
          </li>
        </Ol>
        <H3>B · Auto leveling (CR-Touch)</H3>
        <Ol>
          <li>
            On the screen: <strong>AUTO-LVL → Start</strong>. The probe maps any remaining waviness — let it
            reach <strong>100%</strong>.
          </li>
        </Ol>
        <Callout kind="info">
          Auto-leveling <em>compensates</em> for small dips — it does <strong>not</strong> replace the manual
          paper stage. Always do A first, then B.
        </Callout>
        <H3>C · Live Z-offset (on your first print)</H3>
        <P>Watch the first layer go down and adjust the Z-offset live:</P>
        <Ul>
          <li>
            <strong>Lines not sticking / gaps</strong> → nozzle too high → <em>lower</em> Z-offset.
          </li>
          <li>
            <strong>Filament squished / scraping</strong> → nozzle too low → <em>raise</em> Z-offset.
          </li>
          <li>
            <strong>Just right</strong> → lines touch and squish into a smooth sheet.
          </li>
        </Ul>
      </Step>

      <Step n={4} title="Prep the bed surface">
        <P>
          Wipe the PC spring-steel plate with <strong>isopropyl alcohol (IPA)</strong> before each print.
          Fingerprints and oils are the #1 cause of prints not sticking.
        </P>
      </Step>

      <Step n={5} title="First print: the calibration cube">
        <P>
          Don’t print a real part first — print a <strong>calibration cube</strong> so a bad result means
          “fix the printer,” not “fix the design.”
        </P>
        <Ol>
          <li>
            Go to{" "}
            <Link href="/" className="font-semibold text-primary hover:underline">
              Design
            </Link>
            , type <strong>“calibration cube”</strong>, and slice it.
          </li>
          <li>
            <strong>Download the g-code</strong> to a <strong>FAT32</strong> SD card (see step 7).
          </li>
          <li>Print it, watching the first layer (that’s where Z-offset shows).</li>
          <li>
            When done, <strong>measure each edge with calipers</strong>: ≈ 20.0&nbsp;mm on every axis = dialled in.
          </li>
        </Ol>
      </Step>

      <Step n={6} title="Reading the result (common first-print problems)">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b-2 border-border px-2 py-2 text-left text-muted-foreground">You see…</th>
                <th className="border-b-2 border-border px-2 py-2 text-left text-muted-foreground">Likely cause → fix</th>
              </tr>
            </thead>
            <tbody>
              <Row a="Won't stick / corners lift" b="Bed too low, dirty, or first layer too fast → re-level centre, clean with IPA, lower Z-offset a touch, slow the first layer." />
              <Row a="First layer rough / scraping" b="Nozzle too low → raise Z-offset." />
              <Row a="Stringy wisps between parts" b="Temp too high or retraction too low → drop nozzle ~5 °C." />
              <Row a="Wider bottom rim (elephant's foot)" b="Nozzle too low or bed too hot → raise Z-offset / lower bed temp a few °C." />
              <Row a="Gaps in walls / weak" b="Under-extrusion → check filament path, nudge temperature up." />
            </tbody>
          </table>
        </div>
      </Step>

      <Step n={7} title="SD card rules (Marlin is picky)">
        <Ul>
          <li>
            Plain <code>.gcode</code> file (not <code>.gcode.3mf</code> — the app already extracts it).
          </li>
          <li>
            Card formatted <strong>FAT32</strong>, file in the <strong>root</strong> folder.
          </li>
          <li>
            <strong>Short name</strong>, no spaces (e.g. <code>CUBE.GCODE</code>).
          </li>
          <li>
            Use a <strong>≤ 32 GB</strong> card — very large cards are sometimes unrecognised.
          </li>
        </Ul>
      </Step>

      <p className="mt-8">
        <Link href="/" className="font-semibold text-primary hover:underline">
          ← Back to designing parts
        </Link>
      </p>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-3 flex items-center gap-3 text-xl font-semibold">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {n}
        </span>
        {title}
      </h2>
      <div className="space-y-2 leading-relaxed">{children}</div>
    </Card>
  );
}

function Callout({ kind, children }: { kind: "warn" | "info"; children: ReactNode }) {
  const cls = kind === "warn" ? "border-amber-500/50 bg-amber-500/10" : "border-sky-500/50 bg-sky-500/10";
  return (
    <div className={cn("my-3 rounded-lg border p-3 text-sm", cls)}>
      <span className="mr-2">{kind === "warn" ? "⚠️" : "💡"}</span>
      {children}
    </div>
  );
}

function Row({ a, b }: { a: string; b: string }) {
  return (
    <tr>
      <td className="border-b border-border/60 px-2 py-2 align-top font-medium">{a}</td>
      <td className="border-b border-border/60 px-2 py-2 align-top text-muted-foreground">{b}</td>
    </tr>
  );
}

const P = ({ children }: { children: ReactNode }) => <p>{children}</p>;
const H3 = ({ children }: { children: ReactNode }) => <h3 className="mt-3 text-base font-semibold">{children}</h3>;
const Ol = ({ children }: { children: ReactNode }) => <ol className="ml-5 list-decimal space-y-1">{children}</ol>;
const Ul = ({ children }: { children: ReactNode }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>;
