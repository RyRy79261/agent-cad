import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Printer setup · agent-cad",
  description: "First-time setup for the Creality Ender 5 S1 — leveling, Z-offset and your first print.",
};

/**
 * Beginner setup guide for the Ender 5 S1 — surfaced in the app so a first-timer
 * can get the printer ready without leaving the tool. Mirrors the reference in
 * docs/printer-ender5s1.md.
 */
export default function SetupPage() {
  return (
    <main style={S.main}>
      <p style={S.kicker}>One-time setup · ~30–45 min</p>
      <h1 style={S.h1}>Set up your Ender 5 S1</h1>
      <p style={S.lede}>
        Do these once before your first print. The big one is <strong>leveling the bed</strong> — getting
        the nozzle the same tiny distance from the plate everywhere. Get that right and most problems
        disappear.
      </p>

      <Step n={1} title="Assemble & check the nozzle">
        <p style={S.p}>
          The Ender 5 S1 ships mostly built — mount the gantry, screen and spool holder per the printed
          manual (~30 min). Plug in and power on.
        </p>
        <Callout kind="warn">
          The Sprite hotend uses a <strong>longer nozzle than a standard MK8</strong>. If you ever replace
          it, buy the correct <em>long</em> high-temp 0.4&nbsp;mm nozzle — a short MK8 leaves a gap that
          oozes and clogs.
        </Callout>
      </Step>

      <Step n={2} title="Load the filament">
        <ol style={S.ol}>
          <li>On the screen, <strong>preheat</strong> the nozzle (PLA ≈ 200&nbsp;°C).</li>
          <li>Cut the filament tip at an angle, feed it through the extruder until it grips and pushes.</li>
          <li>Keep feeding until clean plastic flows out of the nozzle, then wipe the blob away.</li>
        </ol>
      </Step>

      <Step n={3} title="Level the bed — the important one">
        <p style={S.p}>
          “Leveling” really means setting the same small nozzle-to-bed gap everywhere. It’s two stages,
          then a live tweak on your first layer.
        </p>

        <h3 style={S.h3}>A · Manual (paper) leveling</h3>
        <ol style={S.ol}>
          <li>From the leveling menu, <strong>home</strong> the printer — the nozzle goes to the centre.</li>
          <li>
            Slide a sheet of <strong>A4 paper</strong> between nozzle and bed. Adjust until you feel
            <strong> light drag</strong> on the paper (about 0.1&nbsp;mm) — it should move but with friction.
          </li>
          <li>
            Move to each of the <strong>4 corners</strong>. At each one, turn that corner’s big knob
            (under the bed) until the paper has the same light drag.
          </li>
          <li>
            <strong>Repeat the corners 2–3 times</strong> — adjusting one corner slightly changes the others.
          </li>
        </ol>

        <h3 style={S.h3}>B · Auto leveling (CR-Touch)</h3>
        <ol style={S.ol}>
          <li>On the screen: <strong>AUTO-LVL → Start</strong>. The probe taps a grid of points to map any
            remaining waviness. Let it reach <strong>100%</strong>.</li>
        </ol>
        <Callout kind="info">
          Auto-leveling <em>compensates</em> for small dips — it does <strong>not</strong> replace the manual
          paper stage. Always do A first, then B.
        </Callout>

        <h3 style={S.h3}>C · Live Z-offset (on your first print)</h3>
        <p style={S.p}>Watch the very first layer go down and adjust the Z-offset <em>live</em> on the screen:</p>
        <ul style={S.ul}>
          <li><strong>Lines not sticking / gaps between them</strong> → nozzle too high → <em>lower</em> Z-offset.</li>
          <li><strong>Filament squished, translucent, or scraping</strong> → nozzle too low → <em>raise</em> Z-offset.</li>
          <li><strong>Just right</strong> → lines touch and squish together slightly into a smooth sheet.</li>
        </ul>
      </Step>

      <Step n={4} title="Prep the bed surface">
        <p style={S.p}>
          Wipe the PC spring-steel plate with <strong>isopropyl alcohol (IPA)</strong> before each print.
          Fingerprints and oils are the #1 cause of prints not sticking.
        </p>
      </Step>

      <Step n={5} title="First print: the calibration cube">
        <p style={S.p}>
          Don’t print a real part first — print a <strong>calibration cube</strong> so a bad result means
          “fix the printer,” not “fix the design.” You can make one right here:
        </p>
        <ol style={S.ol}>
          <li>Go to <Link href="/" style={S.link}>Design</Link>, type <strong>“calibration cube”</strong>, and slice it.</li>
          <li><strong>Download the g-code</strong> and copy it to a <strong>FAT32</strong> SD card (see step 7).</li>
          <li>Print it, watching the first layer (that’s where Z-offset shows).</li>
          <li>When done, <strong>measure each edge with calipers</strong>: ≈ 20.0&nbsp;mm on every axis means you’re dialled in.</li>
        </ol>
      </Step>

      <Step n={6} title="Reading the result (common first-print problems)">
        <table style={S.table}>
          <thead>
            <tr><th style={S.th}>You see…</th><th style={S.th}>Likely cause → fix</th></tr>
          </thead>
          <tbody>
            <Row a="Won't stick / corners lift" b="Bed too low, dirty, or first layer too fast → re-level centre, clean with IPA, lower Z-offset a touch, slow the first layer." />
            <Row a="First layer rough / scraping" b="Nozzle too low → raise Z-offset." />
            <Row a="Stringy wisps between parts" b="Temp too high or retraction too low → drop nozzle ~5 °C." />
            <Row a="Wider bottom rim (elephant's foot)" b="Nozzle too low or bed too hot → raise Z-offset / lower bed temp a few °C." />
            <Row a="Gaps in walls / weak" b="Under-extrusion → check filament path, nudge temperature up." />
          </tbody>
        </table>
      </Step>

      <Step n={7} title="SD card rules (Marlin is picky)">
        <ul style={S.ul}>
          <li>Plain <code>.gcode</code> file (not <code>.gcode.3mf</code> — the app already extracts it).</li>
          <li>Card formatted <strong>FAT32</strong>, file in the <strong>root</strong> folder.</li>
          <li><strong>Short name</strong>, no spaces (e.g. <code>CUBE.GCODE</code>).</li>
          <li>Use a <strong>≤ 32 GB</strong> card — very large cards are sometimes unrecognised.</li>
        </ul>
      </Step>

      <p style={S.footer}>
        Picking a material later? See the <Link href="/" style={S.link}>filament guidance</Link> in the
        designer — PLA to learn, PETG for interior van parts, ASA for sun/heat. Full technical reference:{" "}
        <code>docs/printer-ender5s1.md</code>.
      </p>
      <p style={S.footer}>
        <Link href="/" style={S.link}>← Back to designing parts</Link>
      </p>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section style={S.step}>
      <h2 style={S.h2}>
        <span style={S.num}>{n}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function Callout({ kind, children }: { kind: "warn" | "info"; children: ReactNode }) {
  const c = kind === "warn" ? { bg: "#fff7ed", bd: "#f0a45f", icon: "⚠️" } : { bg: "#eef6ff", bd: "#7ab0e0", icon: "💡" };
  return (
    <p style={{ ...S.callout, background: c.bg, borderColor: c.bd }}>
      <span style={{ marginRight: 8 }}>{c.icon}</span>
      {children}
    </p>
  );
}

function Row({ a, b }: { a: string; b: string }) {
  return (
    <tr>
      <td style={S.td}><strong>{a}</strong></td>
      <td style={S.td}>{b}</td>
    </tr>
  );
}

const S: Record<string, React.CSSProperties> = {
  main: { fontFamily: "system-ui, sans-serif", padding: "2rem 2rem 4rem", maxWidth: 760, margin: "0 auto", color: "#222", lineHeight: 1.55 },
  kicker: { color: "#c9893f", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 },
  h1: { fontSize: "2rem", margin: "0.25rem 0 0.5rem" },
  lede: { fontSize: "1.05rem", color: "#444", marginTop: 0 },
  step: { borderTop: "1px solid #eee", paddingTop: "1.25rem", marginTop: "1.5rem" },
  h2: { fontSize: "1.25rem", display: "flex", alignItems: "center", gap: 10, margin: "0 0 0.5rem" },
  num: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "#c9a27a", color: "#fff", fontSize: "0.95rem", flex: "0 0 auto" },
  h3: { fontSize: "1rem", margin: "1rem 0 0.25rem", color: "#333" },
  p: { margin: "0.4rem 0", color: "#333" },
  ol: { margin: "0.4rem 0", paddingLeft: "1.4rem" },
  ul: { margin: "0.4rem 0", paddingLeft: "1.4rem" },
  callout: { margin: "0.75rem 0", padding: "0.6rem 0.8rem", border: "1px solid", borderRadius: 8, fontSize: "0.92rem" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", marginTop: "0.5rem" },
  th: { textAlign: "left", borderBottom: "2px solid #eee", padding: "0.4rem 0.5rem", color: "#666" },
  td: { borderBottom: "1px solid #f0f0f0", padding: "0.45rem 0.5rem", verticalAlign: "top" },
  link: { color: "#b5732a", fontWeight: 600 },
  footer: { color: "#666", fontSize: "0.9rem", marginTop: "1.5rem" },
};
