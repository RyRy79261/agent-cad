import { ChatWorkspace } from "@/components/chat/chat-workspace";

/**
 * Agent CAD — the local-first chat workspace. Describe a part, generate a
 * build123d model, preview the STL, slice it for the Ender 5 S1, and download
 * plain g-code for the SD card. See docs/agent-cad-functional-spec.md.
 */
export default function Home() {
  return <ChatWorkspace />;
}
