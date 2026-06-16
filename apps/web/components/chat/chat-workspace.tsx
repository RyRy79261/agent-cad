"use client";

import * as React from "react";
import type { BuildVolume, Chat, Printer, SettingsDescriptor, Settings } from "@agent-cad/types";
import { AlertCircle } from "lucide-react";

import * as api from "@/lib/api";
import {
  buildSliceSettings,
  currentStlUrl,
  isDirty,
  latestArtifact,
  sliceStatsFrom,
} from "@/lib/chat";
import { Sidebar } from "./sidebar";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { StatusBadge } from "./status-badge";
import { Stepper } from "./stepper";
import { PrintSettingsPanel } from "./print-settings-panel";
import { ViewerPanel, type ViewerTab } from "@/components/viewer/viewer-panel";
import type { SettingsValues } from "@/components/settings/settings-form";

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
  const [generating, setGenerating] = React.useState(false);
  const [interviewing, setInterviewing] = React.useState(false);
  const [slicing, setSlicing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const threadEndRef = React.useRef<HTMLDivElement>(null);

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
  }, [active?.messages.length, generating, interviewing, slicing]);

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
        await api.runJob(() => api.chatGenerate(chatId, prompt));
        setActive(await api.getChat(chatId));
        await refreshChats();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setGenerating(false);
      }
    },
    [refreshChats],
  );

  const refine = React.useCallback(
    async (chatId: string, instruction: string) => {
      setGenerating(true);
      setTab("model");
      setError(null);
      try {
        await api.runJob(() => api.chatRefine(chatId, instruction));
        setActive(await api.getChat(chatId));
        await refreshChats();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setGenerating(false);
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
        const job = await api.runJob(() => api.chatInterview(chatId, text));
        const ready = Boolean(job.result?.ready);
        const resolved = (job.result?.resolved_prompt as string | undefined) ?? text;
        setActive(await api.getChat(chatId));
        await refreshChats();
        if (ready) await generate(chatId, resolved);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setInterviewing(false);
      }
    },
    [generate, refreshChats],
  );

  const handleSubmit = React.useCallback(
    async (text: string) => {
      setInput("");
      if (!active) {
        // Hero: create the chat (title only — no duplicate first message), then interview.
        try {
          const chat = await api.createChat({ title: text.slice(0, 60) });
          setActive(chat);
          await refreshChats();
          await interview(chat.id, text);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        return;
      }
      // Model exists → refine; mid-interview / pre-model → another clarify turn.
      if (active.current_stl) await refine(active.id, text);
      else await interview(active.id, text);
    },
    [active, interview, refine, refreshChats],
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
  const gcodeUrl = gcodeRef ? api.assetUrl(gcodeRef.url) : null;
  const stats = sliceStatsFrom(gcodeRef);
  const status = active?.status ?? "new";
  const activePrinter = printers.find((p) => p.id === printerId) ?? null;
  const buildVolume = activePrinter?.build_volume as BuildVolume | undefined;

  const onValueChange = React.useCallback(
    (key: string, value: unknown) => setSliceValues((v) => ({ ...v, [key]: value })),
    [],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
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
          <h1 className="truncate text-sm font-semibold">{active?.title ?? "New chat"}</h1>
          {active ? <StatusBadge status={status} /> : null}
        </header>

        <div className="flex min-h-0 flex-1">
          {/* thread + composer */}
          <main className="flex min-w-0 flex-1 flex-col">
            {active ? (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="mx-auto flex max-w-2xl flex-col gap-5">
                    {active.messages.map((m, i) => (
                      <MessageBubble key={i} message={m} onQuickReply={handleSubmit} />
                    ))}
                    {interviewing ? (
                      <p className="text-sm text-muted-foreground">Thinking about your request…</p>
                    ) : null}
                    {generating ? (
                      <p className="text-sm text-muted-foreground">Generating your model…</p>
                    ) : null}
                    {!active.current_stl && !generating && !interviewing && active.messages.length > 0 ? (
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
                  <div className="mx-auto max-w-2xl">
                    <Composer
                      value={input}
                      onChange={setInput}
                      onSubmit={handleSubmit}
                      busy={generating || interviewing}
                      variant="inline"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6">
                <div className="w-full max-w-xl text-center">
                  <h2 className="mb-2 text-2xl font-semibold">What do you want to print?</h2>
                  <p className="mb-6 text-sm text-muted-foreground">
                    Describe a part — Agent CAD models it, checks printability, and slices it for your Ender 5 S1.
                  </p>
                  <Composer
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    busy={generating || interviewing}
                    variant="hero"
                  />
                </div>
              </div>
            )}
          </main>

          {/* viewer-over-settings rail */}
          <div className="flex w-[400px] shrink-0 flex-col gap-4 overflow-y-auto border-l p-4">
            <ViewerPanel
              className="min-h-[300px]"
              stlUrl={stlUrl}
              gcodeUrl={gcodeUrl}
              tab={tab}
              onTabChange={setTab}
              buildVolume={buildVolume}
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
