"use client";

import * as React from "react";
import type { BuildVolume, Chat, Printer, SettingsDescriptor, Settings } from "@agent-cad/types";
import { AlertCircle, Upload, Hammer, SquarePen, PanelRight, MoreHorizontal, Box, ArrowRight, Trash2 } from "lucide-react";

import * as api from "@/lib/api";
import {
  buildSliceSettings,
  currentStlUrl,
  isDirty,
  latestArtifact,
  sliceStatsFrom,
  versioned,
} from "@/lib/chat";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sidebar } from "./sidebar";
import { Composer } from "./composer";
import { ModelSelector } from "./model-selector";
import { MessageBubble } from "./message-bubble";
import { WorkingIndicator, formatElapsed } from "./working-indicator";
import { ReferencesTray } from "./references-tray";
import { StatusBadge } from "./status-badge";
import { Stepper } from "./stepper";
import { PrintSettingsPanel } from "./print-settings-panel";
import { ViewerPanel, type ViewerTab } from "@/components/viewer/viewer-panel";
import type { SettingsValues } from "@/components/settings/settings-form";

/** Refine suggestions shown above the composer once a model exists (design: "Quick Edits"). */
const QUICK_EDITS = ["Make the base wider", "Steeper angle", "Thicken the lip"];
const HOW_IT_WORKS = ["Describe", "Refine", "Slice & print"];

/** Generate/refine can take minutes at high effort — poll long before giving up (FR-CHAT-13). */
const LONG_POLL = { timeoutMs: 600_000 };

/** Files accepted as a pinned reference (images + STL). */
const REFERENCE_RE = /\.(png|jpe?g|webp|gif|stl)$/i;
const isReferenceFile = (f: File) => REFERENCE_RE.test(f.name) || f.type.startsWith("image/");

/** Friendly message for a poll timeout — the job keeps running server-side, so don't alarm. */
function describeError(e: unknown): string {
  if (e instanceof api.ApiError && e.status === 408) {
    return "Still working — complex parts can take a few minutes at higher effort. It keeps generating in the background; reopen this chat shortly to see it, or pick a faster model / lower effort.";
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * The chat workspace: 3-pane shell (sidebar | thread+composer | viewer-over-
 * settings rail) orchestrating the prompt → generate → slice → download flow
 * (UIP-19, SCR-001/007/009-013). Holds all client state; calls the typed API
 * client and polls jobs.
 */
export function ChatWorkspace() {
  const [chats, setChats] = React.useState<Chat[]>([]);
  const [active, setActive] = React.useState<Chat | null>(null);
  const [printers, setPrinters] = React.useState<Printer[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [descriptor, setDescriptor] = React.useState<SettingsDescriptor | null>(null);

  const [printerId, setPrinterId] = React.useState<string | null>(null);
  const [filamentId, setFilamentId] = React.useState<string | null>(null);
  const [sliceValues, setSliceValues] = React.useState<SettingsValues>({});

  const [input, setInput] = React.useState("");
  const [tab, setTab] = React.useState<ViewerTab>("model");
  const [showPreview, setShowPreview] = React.useState(true);
  const [railWidth, setRailWidth] = React.useState(400);
  const [generating, setGenerating] = React.useState(false);
  const [interviewing, setInterviewing] = React.useState(false);
  const [slicing, setSlicing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Optimistic message + live "working" timer: show the user's message instantly,
  // then a ticking elapsed counter while the model runs (asks #2/#3).
  const [pendingText, setPendingText] = React.useState<string | null>(null);
  const [workStartedAt, setWorkStartedAt] = React.useState<number | null>(null);
  const [lastDurationMs, setLastDurationMs] = React.useState<number | null>(null);

  const [dragActive, setDragActive] = React.useState(false);
  const threadEndRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const refInputRef = React.useRef<HTMLInputElement>(null);

  // --- initial load -------------------------------------------------------- //
  React.useEffect(() => {
    void (async () => {
      try {
        const [cs, ps, st] = await Promise.all([api.listChats(), api.listPrinters(), api.getSettings()]);
        setChats(cs);
        setPrinters(ps);
        setSettings(st);
        const def = ps.find((p) => p.default) ?? ps[0] ?? null;
        if (def) {
          setPrinterId(def.id);
          setFilamentId(def.filaments[0]?.id ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // --- descriptor follows printer + filament ------------------------------- //
  React.useEffect(() => {
    if (!printerId) return;
    void (async () => {
      try {
        setDescriptor(await api.getSettingsDescriptor(printerId, filamentId ?? undefined));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [printerId, filamentId]);

  React.useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, generating, interviewing, slicing, pendingText]);

  // Drag-resizable preview rail, persisted across reloads.
  React.useEffect(() => {
    void (async () => {
      const saved = Number(localStorage.getItem("agentcad:railWidth"));
      if (saved >= 320 && saved <= 1200) setRailWidth(saved);
    })();
  }, []);
  React.useEffect(() => {
    localStorage.setItem("agentcad:railWidth", String(Math.round(railWidth)));
  }, [railWidth]);

  const refreshChats = React.useCallback(async () => {
    try {
      setChats(await api.listChats());
    } catch {
      /* sidebar refresh is best-effort */
    }
  }, []);

  // --- actions ------------------------------------------------------------- //
  const selectChat = React.useCallback(async (id: string) => {
    setError(null);
    setSliceValues({});
    setTab("model");
    try {
      const chat = await api.getChat(id);
      setActive(chat);
      if (chat.printer_id) setPrinterId(chat.printer_id);
      if (chat.filament_id) setFilamentId(chat.filament_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const newChat = React.useCallback(() => {
    setActive(null);
    setInput("");
    setSliceValues({});
    setTab("model");
    setError(null);
  }, []);

  const deleteChat = React.useCallback(
    async (id: string) => {
      try {
        await api.deleteChat(id);
        if (active?.id === id) setActive(null);
        await refreshChats();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [active, refreshChats],
  );

  const generate = React.useCallback(
    async (chatId: string, prompt: string) => {
      setGenerating(true);
      setTab("model");
      setError(null);
      try {
        await api.runJob(() => api.chatGenerate(chatId, prompt), LONG_POLL);
        setActive(await api.getChat(chatId));
        await refreshChats();
      } catch (e) {
        setError(describeError(e));
        await refreshChats();
      } finally {
        setGenerating(false);
      }
    },
    [refreshChats],
  );

  // A message on an existing model: the agent either talks back (a question, an opinion,
  // ideation) or makes a surgical edit — it no longer regenerates on every message.
  const respond = React.useCallback(
    async (chatId: string, text: string) => {
      setInterviewing(true);
      setError(null);
      try {
        const job = await api.runJob(() => api.chatRespond(chatId, text), LONG_POLL);
        if (job.result?.action !== "chat") setTab("model"); // an edit produced a new model
        setActive(await api.getChat(chatId));
        await refreshChats();
      } catch (e) {
        setError(describeError(e));
        await refreshChats();
      } finally {
        setInterviewing(false);
      }
    },
    [refreshChats],
  );

  // Clarify-before-generate (FR-CHAT-2). One interview turn either asks a follow-up
  // (appended to the thread with quick-reply chips) or signals ready → auto-generate.
  const interview = React.useCallback(
    async (chatId: string, text: string) => {
      setInterviewing(true);
      setError(null);
      try {
        // One job: it asks a follow-up, OR (when ready) generates inline — so poll long.
        await api.runJob(() => api.chatInterview(chatId, text), LONG_POLL);
        const updated = await api.getChat(chatId);
        setActive(updated);
        if (updated.current_stl) setTab("model"); // ready → it generated a model
        await refreshChats();
      } catch (e) {
        setError(describeError(e));
        await refreshChats();
      } finally {
        setInterviewing(false);
      }
    },
    [refreshChats],
  );

  const handleSubmit = React.useCallback(
    async (text: string) => {
      setInput("");
      setLastDurationMs(null);
      const startedAt = Date.now();
      setPendingText(text); // show the user's message instantly
      setWorkStartedAt(startedAt); // start the live timer
      try {
        if (!active) {
          // Hero: create the chat (title only — no duplicate first message), then interview.
          const chat = await api.createChat({ title: text.slice(0, 60) });
          setActive(chat);
          await refreshChats();
          await interview(chat.id, text);
        } else if (active.current_stl) {
          await respond(active.id, text); // model exists → talk back, or surgically edit
        } else {
          await interview(active.id, text); // mid-interview / pre-model → another clarify turn
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLastDurationMs(Date.now() - startedAt); // "took Xm Ys"
        setWorkStartedAt(null);
        setPendingText(null);
      }
    },
    [active, interview, respond, refreshChats],
  );

  // "Skip & generate now" — bypass further questions, generate from the brief so far.
  const skipToGenerate = React.useCallback(async () => {
    if (!active) return;
    const brief =
      active.messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n") || active.title;
    await generate(active.id, brief);
  }, [active, generate]);

  // Import an STL: validate server-side, then attach into a chat as its current model (FR-IMP-1).
  const importFile = React.useCallback(
    async (file: File) => {
      setGenerating(true);
      setTab("model");
      setError(null);
      try {
        const res = await api.importStl(file);
        const chatId = active?.id ?? (await api.createChat({ title: file.name })).id;
        const updated = await api.attachImport(chatId, res.id);
        setActive(updated);
        await refreshChats();
        if (!res.fits_build_volume) {
          setError(`Imported, but it doesn't fit the bed (${res.bbox.x}×${res.bbox.y}×${res.bbox.z} mm).`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setGenerating(false);
      }
    },
    [active, refreshChats],
  );

  // Pin an image/STL reference (from the picker, drag-drop, or clipboard paste). Creates a
  // chat if there isn't one yet so a sketch can be the very first thing you add.
  const addReferenceFiles = React.useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setError(null);
      try {
        // Resolve/create the target chat ONCE — a multi-file add must not spawn several
        // chats and split the references across them.
        let chatId = active?.id;
        if (!chatId) {
          const created = await api.createChat({ title: "New chat" });
          setActive(created);
          chatId = created.id;
        }
        let updated: Chat | null = null;
        for (const file of files) {
          updated = await api.addReference(chatId, file);
        }
        if (updated) setActive(updated);
        await refreshChats();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [active, refreshChats],
  );

  const removeRef = React.useCallback(
    async (refId: string) => {
      if (!active) return;
      try {
        setActive(await api.removeReference(active.id, refId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [active],
  );

  // Paste an image anywhere → pin it as a reference.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (imgs.length) {
        e.preventDefault();
        void addReferenceFiles(imgs);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addReferenceFiles]);

  const slice = React.useCallback(async () => {
    if (!active) return;
    setSlicing(true);
    setError(null);
    try {
      const body =
        descriptor && isDirty(descriptor, sliceValues)
          ? { filament_id: filamentId ?? undefined, settings: buildSliceSettings(descriptor, sliceValues) }
          : { filament_id: filamentId ?? undefined };
      await api.runJob(() => api.chatSlice(active.id, body));
      setActive(await api.getChat(active.id));
      setTab("slice"); // auto-switch to Slice Preview on success (FR-CHAT-5)
      await refreshChats();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSlicing(false);
    }
  }, [active, descriptor, sliceValues, filamentId, refreshChats]);

  // --- derived ------------------------------------------------------------- //
  const stlUrl = currentStlUrl(active);
  const gcodeRef = latestArtifact(active, "gcode");
  const gcodeUrl = gcodeRef ? versioned(api.assetUrl(gcodeRef.url), active) : null;
  const stats = sliceStatsFrom(gcodeRef);
  const status = active?.status ?? "new";
  const activePrinter = printers.find((p) => p.id === printerId) ?? null;
  const buildVolume = activePrinter?.build_volume as BuildVolume | undefined;
  const busy = generating || interviewing;
  // Suggestions row above the composer: refine "quick edits" once a model exists,
  // otherwise the latest AI turn's quick-reply chips (the interview answers).
  const lastAi = active ? [...active.messages].reverse().find((m) => m.role === "assistant") : undefined;
  const suggestions = active?.current_stl ? QUICK_EDITS : lastAi?.quick_replies ?? [];

  const onValueChange = React.useCallback(
    (key: string, value: unknown) => setSliceValues((v) => ({ ...v, [key]: value })),
    [],
  );

  // Drag the divider to resize the preview rail (clamped so neither pane collapses).
  const startResize = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const w = window.innerWidth - ev.clientX;
      setRailWidth(Math.min(Math.max(w, 320), Math.max(360, window.innerWidth - 420)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Persist a model/effort change (optimistic) — drives generate / interview / refine.
  const updateAi = React.useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        void api.updateSettings(next).catch((e) => setError(e instanceof Error ? e.message : String(e)));
        return next;
      });
    },
    [],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-importing the same file
          if (file) void importFile(file);
        }}
      />
      <input
        ref={refInputRef}
        type="file"
        accept="image/*,.stl"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void addReferenceFiles(files.filter(isReferenceFile));
        }}
      />
      <Sidebar
        chats={chats}
        activeId={active?.id ?? null}
        onSelect={selectChat}
        onNew={newChat}
        onDelete={deleteChat}
        userName={settings?.user_name}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-6 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {active?.current_stl ? <Box className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
            <h1 className="truncate text-sm font-semibold">{active?.title ?? "New chat"}</h1>
            {active ? <StatusBadge status={status} /> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {settings ? (
              <ModelSelector
                model={settings.active_model}
                effort={settings.effort}
                onChange={updateAi}
                disabled={busy}
              />
            ) : null}
            {active ? (
              <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="New chat" onClick={newChat}>
                <SquarePen className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                title={showPreview ? "Hide preview panel" : "Show preview panel"}
                onClick={() => setShowPreview((s) => !s)}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="More">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-danger" onClick={() => active && deleteChat(active.id)}>
                    <Trash2 className="h-4 w-4" />
                    Delete chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            ) : null}
          </div>
        </header>

        <div
          className="relative flex min-h-0 flex-1"
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes("Files")) {
              e.preventDefault();
              setDragActive(true);
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            void addReferenceFiles(Array.from(e.dataTransfer.files).filter(isReferenceFile));
          }}
        >
          {dragActive ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
              <div className="rounded-2xl border-2 border-dashed border-primary bg-card px-6 py-4 text-sm font-medium text-foreground">
                Drop an image or STL to pin it as a reference
              </div>
            </div>
          ) : null}
          {/* thread + composer */}
          <main className="flex min-w-0 flex-1 flex-col">
            {active ? (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="mx-auto flex max-w-2xl flex-col gap-5">
                    {active.messages.map((m, i) => (
                      <MessageBubble key={i} message={m} />
                    ))}
                    {/* optimistic: show the just-sent message + a live working timer */}
                    {busy && pendingText ? (
                      <MessageBubble message={{ role: "user", content: pendingText, ts: 0, artifact_refs: [] }} />
                    ) : null}
                    {busy && workStartedAt ? (
                      <WorkingIndicator
                        label={generating ? "Generating your model" : "Thinking about your request"}
                        startedAt={workStartedAt}
                      />
                    ) : null}
                    {!busy && lastDurationMs != null ? (
                      <p className="text-center text-xs text-subtle-foreground">
                        Took {formatElapsed(lastDurationMs / 1000)}
                      </p>
                    ) : null}
                    {!active.current_stl && !busy && active.messages.length > 0 ? (
                      <button
                        type="button"
                        onClick={skipToGenerate}
                        className="self-start text-xs font-medium text-primary hover:underline"
                      >
                        Skip questions & generate now →
                      </button>
                    ) : null}
                    <div ref={threadEndRef} />
                  </div>
                </div>
                <div className="border-t px-6 py-4">
                  <div className="mx-auto max-w-2xl space-y-3">
                    <ReferencesTray
                      references={active.references ?? []}
                      onRemove={removeRef}
                      onAdd={() => refInputRef.current?.click()}
                      disabled={busy}
                    />
                    {suggestions.length > 0 && !busy ? (
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleSubmit(s)}
                            className="rounded-full border border-border-strong bg-elevated px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <Composer
                      value={input}
                      onChange={setInput}
                      onSubmit={handleSubmit}
                      busy={busy}
                      variant="inline"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6">
                <div className="w-full max-w-xl text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                    <Hammer className="h-6 w-6 text-primary" />
                  </div>
                  <h2 className="mb-2 text-2xl font-semibold">What would you like to make?</h2>
                  <p className="mb-6 text-sm text-muted-foreground">
                    Describe your idea in plain language. Agent CAD will ask a few quick questions, then generate a
                    model that&apos;s ready to 3D print.
                  </p>
                  <Composer
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    busy={busy}
                    variant="hero"
                  />
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      import an STL as the model
                    </button>
                    <ReferencesTray
                      references={[]}
                      onRemove={removeRef}
                      onAdd={() => refInputRef.current?.click()}
                      disabled={busy}
                    />
                  </div>
                  <div className="mt-8 flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">
                    {HOW_IT_WORKS.map((step, i) => (
                      <React.Fragment key={step}>
                        <span>{step}</span>
                        {i < HOW_IT_WORKS.length - 1 ? <ArrowRight className="h-3 w-3" /> : null}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* drag handle + viewer-over-settings rail (resizable) */}
          {showPreview ? (
          <>
          <div
            onMouseDown={startResize}
            title="Drag to resize"
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary"
          />
          <div
            style={{ width: railWidth }}
            className="flex shrink-0 flex-col gap-4 overflow-y-auto p-4"
          >
            <ViewerPanel
              className="min-h-[300px]"
              stlUrl={stlUrl}
              gcodeUrl={gcodeUrl}
              tab={tab}
              onTabChange={setTab}
              buildVolume={buildVolume}
              printerName={activePrinter?.name}
              generating={generating}
              slicing={slicing}
            />
            <PrintSettingsPanel
              printers={printers}
              printerId={printerId}
              filamentId={filamentId}
              onPrinterChange={(id) => {
                setPrinterId(id);
                const p = printers.find((x) => x.id === id);
                setFilamentId(p?.filaments[0]?.id ?? null);
                setSliceValues({});
              }}
              onFilamentChange={(id) => {
                setFilamentId(id);
                setSliceValues({});
              }}
              descriptor={descriptor}
              values={sliceValues}
              onValueChange={onValueChange}
              hasModel={Boolean(stlUrl)}
              slicing={slicing}
              onSlice={slice}
              sliced={Boolean(gcodeUrl)}
              stats={stats}
              onDownload={gcodeUrl ? () => window.open(gcodeUrl, "_blank") : undefined}
            />
          </div>
          </>
          ) : null}
        </div>

        {error ? (
          <div className="flex items-center gap-2 border-t border-danger/30 bg-danger-muted px-6 py-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <footer className="border-t px-6 py-2">
          <Stepper status={status} />
        </footer>
      </div>
    </div>
  );
}
