import { create } from "zustand";
import type { AppSnapshot } from "../../electron/ipc/contracts";

interface AppStore extends AppSnapshot {
  setSnapshot: (snapshot: AppSnapshot) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  workspaces: [],
  activeWorkspaceId: "",
  loadingState: undefined,
  setSnapshot: (snapshot) => set(snapshot)
}));
