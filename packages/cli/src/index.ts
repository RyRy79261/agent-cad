#!/usr/bin/env node
/**
 * agent-cad CLI — a thin orchestrator over the local FastAPI service.
 *
 * This is the "control plane" CLI used by the app/automation. (Claude Code's
 * own inner loop drives the Python `cad` / `slice` / `scan` CLIs directly — see
 * services/* — which is the leanest path for parametric iteration.)
 */

import { readFile } from "node:fs/promises";
import { Command } from "commander";
import {
  DEFAULT_API_URL,
  type Job,
  type JobRef,
  type PartSummary,
} from "@agent-cad/types";

const program = new Command();

program
  .name("agent-cad")
  .description("Orchestrate code-to-CAD, slicing and scan cleanup via the local API.")
  .option(
    "--api-url <url>",
    "Base URL of the FastAPI service",
    process.env.AGENT_CAD_API_URL ?? DEFAULT_API_URL,
  );

function apiUrl(): string {
  return program.opts().apiUrl as string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** Poll a submitted job until it reaches a terminal state. */
async function waitForJob(jobId: string, intervalMs = 500): Promise<Job> {
  for (;;) {
    const job = await api<Job>(`/jobs/${jobId}`);
    if (job.status === "succeeded" || job.status === "failed") return job;
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function runJob(kind: string, ref: JobRef): Promise<void> {
  process.stdout.write(`${kind} job ${ref.job_id} `);
  const job = await waitForJob(ref.job_id);
  process.stdout.write("\n");
  console.log(JSON.stringify(job.result ?? { error: job.error }, null, 2));
  if (job.status === "failed") process.exitCode = 1;
}

program
  .command("build <model>")
  .description("Build a parametric model.py into STL/STEP/3MF + SVG.")
  .option("--params <file>", "params.json to inject")
  .option("--out <dir>", "output directory")
  .option("--name <name>", "artifact base name")
  .action(async (model: string, opts: { params?: string; out?: string; name?: string }) => {
    const params = opts.params
      ? (JSON.parse(await readFile(opts.params, "utf8")) as Record<string, unknown>)
      : {};
    const ref = await api<JobRef>("/cad/build", {
      method: "POST",
      body: JSON.stringify({ model_path: model, params, out_dir: opts.out, name: opts.name }),
    });
    await runJob("cad.build", ref);
  });

program
  .command("slice <model>")
  .description("Slice a model with OrcaSlicer (extracts plain g-code).")
  .requiredOption("--machine <json>", "printer profile JSON")
  .requiredOption("--process <json>", "print-settings JSON")
  .requiredOption("--filament <json...>", "filament JSON(s)")
  .option("--output <archive>", "output .gcode.3mf path")
  .action(
    async (
      model: string,
      opts: { machine: string; process: string; filament: string[]; output?: string },
    ) => {
      const ref = await api<JobRef>("/slice/orca", {
        method: "POST",
        body: JSON.stringify({
          model,
          machine: opts.machine,
          process: opts.process,
          filaments: opts.filament,
          output: opts.output,
        }),
      });
      await runJob("slice.orca", ref);
    },
  );

program
  .command("scan <input>")
  .description("Clean a raw scan mesh into a manifold reference mesh.")
  .option("--out <file>", "output mesh path")
  .option("--target-faces <n>", "decimate to ~n faces", (v) => parseInt(v, 10))
  .action(async (input: string, opts: { out?: string; targetFaces?: number }) => {
    const ref = await api<JobRef>("/scan/clean", {
      method: "POST",
      body: JSON.stringify({
        input_path: input,
        output_path: opts.out,
        target_faces: opts.targetFaces,
      }),
    });
    await runJob("scan.clean", ref);
  });

program
  .command("parts")
  .description("List the parts under projects/.")
  .action(async () => {
    const parts = await api<PartSummary[]>("/parts");
    for (const p of parts) {
      const status = (p.print?.status as string) ?? "—";
      console.log(`${p.name}\t[${status}]\t${p.artifacts.length} artifact(s)`);
    }
  });

program
  .command("jobs")
  .description("List recent jobs.")
  .action(async () => {
    const jobs = await api<Job[]>("/jobs");
    for (const j of jobs) console.log(`${j.id}\t${j.kind}\t${j.status}`);
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
