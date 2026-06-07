import type {
  ChatConversationDTO,
  ChatMessageDTO,
} from "@/features/chat/chat.types";

import type { AgentItem, ChatAttachmentDTO } from "./chat-types";

export type AgentListResponse = {
  success: boolean;
  data?: { items: AgentItem[] };
  error?: { message?: string };
};

export type MessageListResponse = {
  success: boolean;
  data?: ChatMessageDTO[];
};

export type ConversationListResponse = {
  success: boolean;
  data?: { items: ChatConversationDTO[] };
  error?: { message?: string };
};

export type ConversationUpdateResponse = {
  success: boolean;
  data?: ChatConversationDTO;
  error?: { message?: string };
};

export type ConversationCreateResponse = {
  success: boolean;
  data?: ChatConversationDTO;
  error?: { message?: string };
};

export type ChatAttachmentResponse = {
  success: boolean;
  data?: ChatAttachmentDTO;
  error?: { message?: string };
};
