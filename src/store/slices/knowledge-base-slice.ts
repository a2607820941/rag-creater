import type { StateCreator } from "zustand";
import type {
  RagChunk,
  RagDetail,
  RagDoc,
  RagListItem,
} from "@/features/knowledge-bases/types";

export type KnowledgeBaseSlice = {
  /** RAG 轻量列表。列表页展示、搜索、排序、统计、新建、编辑、删除都基于该数组。 */
  items: RagListItem[];
  /** 当前选中的 RAG id。 */
  selectedId: string | null;
  /** 当前选中的 RAG 详情。Phase 2 查看详情时按需请求后写入。 */
  selected: RagDetail | null;
  /** 当前选中 RAG 的文档列表。Phase 2 按需请求后写入。 */
  selectedDocs: RagDoc[];
  /** 当前查看的分片列表。Phase 2 按需请求后写入。 */
  selectedChunks: RagChunk[];
  /** 列表初始化或后续请求中的 loading 状态。 */
  loading: boolean;
  /** 请求或本地操作产生的错误信息。 */
  error: string | null;
  setItems: (items: RagListItem[]) => void;
  setSelectedId: (id: string | null) => void;
  setSelected: (detail: RagDetail | null) => void;
  setSelectedDocs: (docs: RagDoc[]) => void;
  setSelectedChunks: (chunks: RagChunk[]) => void;
  addItem: (item: RagListItem) => void;
  updateItem: (id: string, patch: Partial<RagListItem>) => void;
  deleteItem: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

export const createKnowledgeBaseSlice: StateCreator<
  KnowledgeBaseSlice,
  [],
  [],
  KnowledgeBaseSlice
> = (set) => ({
  items: [],
  selectedId: null,
  selected: null,
  selectedDocs: [],
  selectedChunks: [],
  loading: false,
  error: null,
  setItems: (items) => set({ items }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setSelected: (selected) => set({ selected }),
  setSelectedDocs: (selectedDocs) => set({ selectedDocs }),
  setSelectedChunks: (selectedChunks) => set({ selectedChunks }),
  addItem: (item) =>
    set((state) => ({
      items: [item, ...state.items],
    })),
  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
      selected:
        state.selected?.id === id
          ? { ...state.selected, ...patch }
          : state.selected,
    })),
  deleteItem: (id) =>
    set((state) => {
      const isSelected = state.selectedId === id;

      return {
        items: state.items.filter((item) => item.id !== id),
        selectedId: isSelected ? null : state.selectedId,
        selected: isSelected ? null : state.selected,
        selectedDocs: isSelected ? [] : state.selectedDocs,
        selectedChunks: isSelected ? [] : state.selectedChunks,
      };
    }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
});
