import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { todayIso } from '../model/dates';
import { clearField, type EntryFilter, type FilterField } from '../model/filter';
import * as ops from '../model/operations';
import { sampleProject } from '../model/sample-data';
import type { Entry, Project, Settings, Timeline } from '../model/types';

type State = {
  project: Project;
  selectedEntryId: string | null;
  /** Applies to both the table and the chart. Not saved: every visit starts unfiltered. */
  filter: EntryFilter;

  setFilter: (patch: Partial<EntryFilter>) => void;
  clearFilterField: (field: FilterField) => void;
  resetFilter: () => void;
  /** Show only this timeline; calling it again for the same timeline shows all again. */
  toggleTimelineFilter: (id: string) => void;

  select: (id: string | null) => void;
  setSettings: (patch: Partial<Settings>) => void;

  addEntry: (init?: Partial<Entry>) => void;
  updateEntry: (id: string, patch: Partial<Omit<Entry, 'id'>>) => void;
  setMilestone: (id: string, milestone: boolean) => void;
  duplicateEntry: (id: string) => void;
  deleteEntry: (id: string) => void;
  sortEntries: () => void;

  addTimeline: (name?: string) => string;
  updateTimeline: (id: string, patch: Partial<Omit<Timeline, 'id'>>) => void;
  moveTimeline: (id: string, delta: number) => void;
  deleteTimeline: (id: string) => void;

  replaceData: (entries: Entry[], timelines: Timeline[]) => void;
  loadSample: () => void;
  clearAll: () => void;
};

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Applies a pure operation to the project. */
      const apply = (fn: (p: Project) => Project) => set((s) => ({ project: fn(s.project) }));

      return {
        project: sampleProject,
        selectedEntryId: null,
        filter: {},

        setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
        clearFilterField: (field) => set((s) => ({ filter: clearField(s.filter, field) })),
        resetFilter: () => set({ filter: {} }),
        toggleTimelineFilter: (id) =>
          set((s) => {
            const only = s.filter.timelineIds?.length === 1 && s.filter.timelineIds[0] === id;
            return { filter: only ? clearField(s.filter, 'timeline') : { ...s.filter, timelineIds: [id] } };
          }),

        select: (id) => set({ selectedEntryId: id }),
        setSettings: (patch) => apply((p) => ({ ...p, settings: { ...p.settings, ...patch } })),

        addEntry: (init) => {
          // Put the new entry on the filtered timeline, and drop the other filters so it is visible.
          const { project, filter } = get();
          const timelineId = init?.timelineId ?? filter.timelineIds?.[0];
          const r = ops.addEntry(project, todayIso(), { ...init, ...(timelineId ? { timelineId } : {}) });
          set({
            project: r.project,
            selectedEntryId: r.id,
            filter: filter.timelineIds?.length ? { timelineIds: filter.timelineIds } : {},
          });
        },
        updateEntry: (id, patch) => apply((p) => ops.updateEntry(p, id, patch)),
        setMilestone: (id, m) => apply((p) => ops.setMilestone(p, id, m)),
        duplicateEntry: (id) => {
          const r = ops.duplicateEntry(get().project, id);
          set({ project: r.project, selectedEntryId: r.id });
        },
        deleteEntry: (id) =>
          set((s) => ({
            project: ops.deleteEntry(s.project, id),
            selectedEntryId: s.selectedEntryId === id ? null : s.selectedEntryId,
          })),
        sortEntries: () => apply(ops.sortEntries),

        addTimeline: (name) => {
          const r = ops.addTimeline(get().project, name);
          set({ project: r.project });
          return r.id;
        },
        updateTimeline: (id, patch) => apply((p) => ops.updateTimeline(p, id, patch)),
        moveTimeline: (id, delta) => apply((p) => ops.moveTimeline(p, id, delta)),
        deleteTimeline: (id) =>
          set((s) => {
            const ids = s.filter.timelineIds?.filter((t) => t !== id);
            return {
              project: ops.deleteTimeline(s.project, id),
              filter: ids?.length ? { ...s.filter, timelineIds: ids } : clearField(s.filter, 'timeline'),
            };
          }),

        replaceData: (entries, timelines) =>
          set((s) => ({ project: { ...s.project, entries, timelines }, selectedEntryId: null, filter: {} })),
        loadSample: () =>
          set((s) => ({ project: { ...sampleProject, settings: s.project.settings }, selectedEntryId: null, filter: {} })),
        clearAll: () => set((s) => ({ project: ops.emptyProject(s.project.settings), selectedEntryId: null, filter: {} })),
      };
    },
    {
      // Saved in this browser's localStorage. If storage is unavailable, the app still works (unsaved).
      name: 'overlay-timeline:project',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ project: s.project }),
    },
  ),
);
