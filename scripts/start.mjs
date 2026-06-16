#!/usr/bin/env node
// `pnpm start` — bring up the Agent CAD API (:8420) and web (:3420) together,
// prefix their logs, and open the browser. No extra deps: pure Node child_process.
// Ctrl-C stops both. Ports are baked into the API run() default and the web `dev`
// script; override the API origin via AGENT_CAD_CORS_ORIGINS / NEXT_PUBLIC_AGENT_CAD_API_URL.
import { spawn } from "node:child_process";
import process from "node:process";

const WEB_URL = "http://localhost:3420";
const API_URL = "http://localhost:8420";
const procs = [];
let shuttingDown = false;

function run(name, command, args, opts = {}) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
  const tag = `[${name}]`;
  const pipe = (stream, out) => {
    stream.setEncoding("utf8");
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) out.write(`${tag} ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("error", (err) => {
    process.stderr.write(`${tag} failed to start: ${err.message}\n`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    process.stdout.write(`${tag} exited (${signal ?? code})\n`);
    shutdown(code ?? 0);
  });
  procs.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    try {
      p.kill("SIGINT");
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// API: FastAPI on :8420
run("api", "uv", ["run", "--package", "apiserver", "uvicorn", "api.main:app", "--port", "8420"]);
// Web: Next.js on :3420 (the port is baked into the web `dev` script)
run("web", "pnpm", ["-C", "apps/web", "dev"]);

// Best-effort browser open once the web server has had a moment to boot.
setTimeout(() => {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", WEB_URL] : [WEB_URL];
  try {
    const child = spawn(opener, args, { stdio: "ignore", detached: true });
    // A missing opener (e.g. no `xdg-open` on a headless/WSL box) surfaces as an
    // async 'error' event — NOT a thrown exception — so it must be handled here or
    // it crashes the whole launcher and orphans the API/web processes.
    child.on("error", () => process.stdout.write(`[start] open ${WEB_URL} in your browser\n`));
    child.unref();
    process.stdout.write(`[start] opening ${WEB_URL}\n`);
  } catch {
    process.stdout.write(`[start] open ${WEB_URL} in your browser\n`);
  }
}, 4000);

process.stdout.write(`[start] API -> ${API_URL} · web -> ${WEB_URL} (Ctrl-C to stop both)\n`);
