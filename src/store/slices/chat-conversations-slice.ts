import type { StateCreator } from "zustand";

import type { ChatConversationDTO } from "@/features/chat/chat.types";
import type { StoreState } from "../types";

type ConversationListResponse = {
  success: boolean;
  data?: { items: ChatConversationDTO[] };
  error?: { message?: string };
};

let loadConversationsPromise: Promise<ChatConversationDTO[]> | null = null;

export type ChatConversationsSlice = {
  chatConversations: ChatConversationDTO[];
  chatConversationsLoading: boolean;
  chatConversationsLoaded: boolean;
  chatConversationsError: string | null;
  loadChatConversations: (options?: {
    force?: boolean;
  }) => Promise<ChatConversationDTO[]>;
  setChatConversations: (items: ChatConversationDTO[]) => void;
  upsertChatConversation: (item: ChatConversationDTO) => void;
  removeChatConversation: (id: string) => void;
};

export const createChatConversationsSlice: StateCreator<
  StoreState,
  [],
  [],
  ChatConversationsSlice
> = (set, get) => ({
  chatConversations: [],
  chatConversationsLoading: false,
  chatConversationsLoaded: false,
  chatConversationsError: null,
  loadChatConversations: async (options) => {
    const force = options?.force ?? false;
    const {
      chatConversations,
      chatConversationsLoaded,
      chatConversationsLoading,
    } = get();

    if (!force && chatConversationsLoaded) {
      return chatConversations;
    }

    if (chatConversationsLoading && loadConversationsPromise) {
      return loadConversationsPromise;
    }

    set({
      chatConversationsLoading: true,
      chatConversationsError: null,
    });

    loadConversationsPromise = fetch("/api/conversations?pageSize=100")
      .then((response) => response.json())
      .then((json: ConversationListResponse) => {
        if (!json.success || !json.data) {
          throw new Error(
            json.error?.message || "Failed to load conversations"
          );
        }

        set({
          chatConversations: json.data.items,
          chatConversationsLoaded: true,
          chatConversationsError: null,
        });

        return json.data.items;
      })
      .catch((error) => {
        set({
          chatConversationsError:
            error instanceof Error
              ? error.message
              : "Failed to load conversations",
        });
        throw error;
      })
      .finally(() => {
        loadConversationsPromise = null;
        set({ chatConversationsLoading: false });
      });

    return loadConversationsPromise;
  },
  setChatConversations: (items) =>
    set({
      chatConversations: items,
      chatConversationsLoaded: true,
    }),
  upsertChatConversation: (item) =>
    set((state) => ({
      chatConversations: [
        item,
        ...state.chatConversations.filter(
          (conversation) => conversation.id !== item.id
        ),
      ],
      chatConversationsLoaded: true,
    })),
  removeChatConversation: (id) =>
    set((state) => ({
      chatConversations: state.chatConversations.filter(
        (conversation) => conversation.id !== id
      ),
    })),
});
