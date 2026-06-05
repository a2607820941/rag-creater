import type { StateCreator } from "zustand";

import type { StoreState } from "../types";

export type AppSlice = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
};

export const createAppSlice: StateCreator<StoreState, [], [], AppSlice> = (
  set
) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
});
