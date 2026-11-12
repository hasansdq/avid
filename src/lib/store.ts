import { create } from "zustand";

interface EnrollState {
  selectedCourse: string;
  setSelectedCourse: (course: string) => void;
}

export const useEnrollStore = create<EnrollState>((set) => ({
  selectedCourse: "",
  setSelectedCourse: (selectedCourse) => set({ selectedCourse }),
}));
