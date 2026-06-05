import type {
  ChatAttachmentDTO,
  ChatKnowledgeFile,
  ChatMessageDTO,
  ChatSkillDraftSaved,
} from "@/features/chat/chat.types";
import type { ChatMode } from "@/features/chat/chat.validation";

export type { ChatAttachmentDTO, ChatMode };

export type AgentItem = {
  id: string;
  name: string;
  description?: string | null;
  answerStyle: string;
  status: string;
};

export type UiMessage = Omit<ChatMessageDTO, "id" | "createdAt"> & {
  id: string;
  pending?: boolean;
  knowledgeFiles?: ChatKnowledgeFile[];
  attachments?: ChatAttachmentDTO[];
};

export type ChatComposerAttachment = ChatAttachmentDTO & {
  localId: string;
};

export type ChatModeOption = {
  value: ChatMode;
  label: string;
  hint: string;
};

export type SkillPublishResponse = {
  success: boolean;
  data?: {
    skill: {
      id: string;
      name: string;
      slug: string;
      status: string;
      version: string;
    };
    manifest: {
      runtime: {
        endpoint: string;
      };
    };
    apiKey: string;
  };
  error?: {
    message?: string;
  };
};

export type SkillPublishState =
  | { status: "idle" }
  | { status: "publishing" }
  | {
      status: "published";
      skill: NonNullable<SkillPublishResponse["data"]>["skill"];
      endpoint: string;
      apiKey: string;
    };

export type SkillPublishDraft = ChatSkillDraftSaved;
