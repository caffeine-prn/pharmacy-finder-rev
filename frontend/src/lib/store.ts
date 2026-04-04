// frontend/src/lib/store.ts
import { create } from "zustand";
import type { FilterState, SortField, SortDirection, MarkerData } from "./types";

interface PharmacyStore {
  // View
  view: "map" | "table";
  setView: (view: "map" | "table") => void;

  // Filters (shared between map and table)
  filters: FilterState;
  setSearch: (search: string) => void;
  setSido: (sido: string) => void;
  setSigungu: (sigungu: string) => void;
  toggleHerbal: () => void;
  toggleAnimal: () => void;
  toggleCross: () => void;
  toggleNoYkiho: () => void;
  resetFilters: () => void;

  // Table sort
  sortField: SortField;
  sortDirection: SortDirection;
  setSort: (field: SortField) => void;

  // Table pagination
  page: number;
  setPage: (page: number) => void;

  // Map state
  selectedPharmacyId: string | null;
  setSelectedPharmacyId: (id: string | null) => void;
  mapCenter: [number, number];
  setMapCenter: (center: [number, number]) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;

  // Markers data (loaded once from CDN)
  markers: MarkerData[];
  setMarkers: (markers: MarkerData[]) => void;

  // Dense view toggle
  isDenseView: boolean;
  toggleDenseView: () => void;
}

const defaultFilters: FilterState = {
  search: "",
  sido: "",
  sigungu: "",
  herbal: false,
  animal: false,
  cross: false,
  noYkiho: false,
};

export const usePharmacyStore = create<PharmacyStore>((set, get) => ({
  // View
  view: "map",
  setView: (view) => set({ view }),

  // Filters
  filters: { ...defaultFilters },
  setSearch: (search) =>
    set((s) => ({ filters: { ...s.filters, search }, page: 1 })),
  setSido: (sido) =>
    set((s) => ({ filters: { ...s.filters, sido, sigungu: "" }, page: 1 })),
  setSigungu: (sigungu) =>
    set((s) => ({ filters: { ...s.filters, sigungu }, page: 1 })),
  toggleHerbal: () =>
    set((s) => ({ filters: { ...s.filters, herbal: !s.filters.herbal }, page: 1 })),
  toggleAnimal: () =>
    set((s) => ({ filters: { ...s.filters, animal: !s.filters.animal }, page: 1 })),
  toggleCross: () =>
    set((s) => ({ filters: { ...s.filters, cross: !s.filters.cross }, page: 1 })),
  toggleNoYkiho: () =>
    set((s) => ({ filters: { ...s.filters, noYkiho: !s.filters.noYkiho }, page: 1 })),
  resetFilters: () => set({ filters: { ...defaultFilters }, page: 1 }),

  // Sort
  sortField: "name",
  sortDirection: "asc",
  setSort: (field) =>
    set((s) => ({
      sortField: field,
      sortDirection:
        s.sortField === field && s.sortDirection === "asc" ? "desc" : "asc",
      page: 1,
    })),

  // Pagination
  page: 1,
  setPage: (page) => set({ page }),

  // Map
  selectedPharmacyId: null,
  setSelectedPharmacyId: (id) => set({ selectedPharmacyId: id }),
  mapCenter: [37.5665, 126.978],
  setMapCenter: (center) => set({ mapCenter: center }),
  mapZoom: 7,
  setMapZoom: (zoom) => set({ mapZoom: zoom }),

  // Markers
  markers: [],
  setMarkers: (markers) => set({ markers }),

  // Dense view
  isDenseView: false,
  toggleDenseView: () => set((s) => ({ isDenseView: !s.isDenseView })),
}));
