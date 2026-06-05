import type { ChatModeOption } from "./chat-types";

export const CHAT_MODE_OPTIONS: ChatModeOption[] = [
  {
    value: "knowledge-agent",
    label: "Knowledge Agent",
    hint: "Knowledge base assistant",
  },
  { value: "agent", label: "Agent", hint: "Role chat" },
  { value: "openai", label: "OpenAI", hint: "Direct model chat" },
  { value: "rag-openai", label: "RAG OpenAI", hint: "Grounded model chat" },
];

export const AGENT_MENU_ITEM_HEIGHT = 56;
export const AGENT_MENU_VISIBLE_COUNT = 4;
export const AGENT_MENU_MAX_HEIGHT =
  AGENT_MENU_ITEM_HEIGHT * AGENT_MENU_VISIBLE_COUNT;
