import { create } from 'zustand';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface WorkspaceState {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  setWorkspaces: (workspaces: Workspace[]) => void;
  selectWorkspace: (id: string | null) => void;
}

const stored =
  typeof window !== 'undefined'
    ? localStorage.getItem('cg_workspace')
    : null;

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  selectedWorkspaceId: stored,
  setWorkspaces: (workspaces) => {
    set((state) => {
      // Auto-select first workspace if none selected
      if (!state.selectedWorkspaceId && workspaces.length > 0) {
        const id = workspaces[0].id;
        localStorage.setItem('cg_workspace', id);
        return { workspaces, selectedWorkspaceId: id };
      }
      return { workspaces };
    });
  },
  selectWorkspace: (id) => {
    if (id) localStorage.setItem('cg_workspace', id);
    else localStorage.removeItem('cg_workspace');
    set({ selectedWorkspaceId: id });
  },
}));
