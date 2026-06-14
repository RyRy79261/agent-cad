import { BuildDemo } from "./BuildDemo";

/**
 * agent-cad control panel — describe/pick a part, build it on the FastAPI server
 * (with printability checks), preview the model + g-code toolpaths, and download
 * for the SD card. See docs/ui-functional-spec.md.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <p className="mb-6 text-muted-foreground">
        Prompt → CAD → print, for a Creality Ender 5 S1. New here?{" "}
        <a href="/setup" className="font-semibold text-primary hover:underline">
          Set up your printer first →
        </a>
      </p>
      <BuildDemo />
    </main>
  );
}
