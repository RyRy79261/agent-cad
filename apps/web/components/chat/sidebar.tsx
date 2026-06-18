"use client";

import * as React from "react";
import Link from "next/link";
import type { Chat } from "@agent-cad/types";
import { Plus, Search, MessageSquare, Trash2, Settings, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SidebarProps {
  chats: Chat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  userName?: string | null;
}

/** Left rail: new chat, search, recent (newest-first), owner footer (FR-CHAT-10, SCR-003/004). */
export function Sidebar({ chats, activeId, onSelect, onNew, onDelete, userName }: SidebarProps) {
  const [query, setQuery] = React.useState("");
  const filtered = query.trim()
    ? chats.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
    : chats;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center gap-2 px-3 py-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            A
          </span>
          Agent CAD
        </Link>
      </div>

      <div className="px-3 pb-2">
        <Button onClick={onNew} className="w-full justify-start gap-2" size="sm">
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-subtle-foreground">
            {chats.length === 0 ? "No chats yet." : "No matches."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((chat) => (
              <li key={chat.id}>
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    chat.id === activeId
                      ? "bg-elevated text-foreground"
                      : "text-muted-foreground hover:bg-elevated/60 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(chat.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
                    <span className="truncate">{chat.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(chat.id)}
                    aria-label={`Delete ${chat.title}`}
                    className="shrink-0 text-subtle-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="border-t p-2">
        <Button variant="ghost" size="sm" asChild className="w-full justify-start gap-2 text-muted-foreground">
          <Link href="/settings">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </Button>
        <div className="mt-1 flex items-center gap-2 rounded-md px-2 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-elevated text-muted-foreground">
            <User className="h-4 w-4" />
          </span>
          <span className="truncate text-sm text-muted-foreground">{userName || "Owner"}</span>
        </div>
      </div>
    </aside>
  );
}
