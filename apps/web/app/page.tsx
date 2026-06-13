import { DEFAULT_API_URL, type PartSummary } from "@agent-cad/types";

const API_URL = process.env.AGENT_CAD_API_URL ?? DEFAULT_API_URL;

async function getParts(): Promise<PartSummary[]> {
  try {
    const res = await fetch(`${API_URL}/parts`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as PartSummary[];
  } catch {
    // API not running — render the shell anyway.
    return [];
  }
}

/**
 * Control-panel shell (SCAFFOLD).
 *
 * This proves the web -> FastAPI wiring by listing the parts under projects/.
 * The full UI (3D viewers, slice/print flow, GitHub history) is specified in
 * docs/ui-functional-spec.md and implemented in the design pass.
 */
export default async function Home() {
  const parts = await getParts();

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 760 }}>
      <h1>agent-cad</h1>
      <p style={{ color: "#666" }}>
        Code-to-CAD & scan-to-mesh pipeline · API: <code>{API_URL}</code>
      </p>

      <h2>Parts</h2>
      {parts.length === 0 ? (
        <p style={{ color: "#999" }}>
          No parts found (is the API running? <code>pnpm py:api</code>). Parts live
          under <code>projects/</code>.
        </p>
      ) : (
        <ul>
          {parts.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong>
              {p.print?.status ? ` — ${String(p.print.status)}` : null}
              {` · ${p.artifacts.length} artifact(s)`}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
