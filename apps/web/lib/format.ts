/** A CSS colour for a filament's free-text colour (hex passthrough, common names, else neutral). */
export function swatchColor(color?: string | null): string {
  if (!color) return "hsl(var(--subtle-foreground))";
  const c = color.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  const named: Record<string, string> = {
    black: "#1f2937", white: "#f3f4f6", grey: "#9ca3af", gray: "#9ca3af", silver: "#cbd5e1",
    red: "#ef4444", blue: "#3b82f6", green: "#22c55e", orange: "#f97316", yellow: "#eab308", purple: "#a855f7",
  };
  const key = Object.keys(named).find((k) => c.toLowerCase().includes(k));
  return (key && named[key]) || "hsl(var(--subtle-foreground))";
}

/** Human-readable byte size (e.g. 1999 → "2.0 KB"). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}
