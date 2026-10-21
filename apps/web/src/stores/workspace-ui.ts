import { create } from 'zustand';

/** Ephemeral view state only; domain data remains in the API/business process. */
export const useWorkspaceUI = create<{
  captureOpen: boolean;
  setCaptureOpen(open: boolean): void;
}>((set) => ({
  captureOpen: false,
  setCaptureOpen: (captureOpen) => set({ captureOpen })
}));
