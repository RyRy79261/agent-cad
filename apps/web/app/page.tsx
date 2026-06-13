import { BuildDemo } from "./BuildDemo";

/**
 * agent-cad control panel — the first end-to-end vertical slice: pick a known-good
 * template, build it on the FastAPI server (with printability checks), and render
 * the resulting STL live in the browser. The fuller UI (prompt box, slice→SD flow,
 * GitHub history) is specified in docs/ui-functional-spec.md.
 */
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 0 }}>agent-cad</h1>
      <p style={{ color: "#666", marginTop: 4 }}>
        Prompt → CAD → print, for a Creality Ender 5 S1. Build a part and see it render below.
      </p>
      <BuildDemo />
    </main>
  );
}
