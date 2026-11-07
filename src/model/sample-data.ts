import type { Project } from './types';

/** Realistic example used as the shared visual test case: overlapping bars and milestones on shared rows. */
export const sampleProject: Project = {
  timelines: [
    { id: 'product', name: 'Product', color: '#2563eb', order: 0 },
    { id: 'marketing', name: 'Marketing', color: '#db2777', order: 1 },
    { id: 'hiring', name: 'Hiring', color: '#059669', order: 2 },
    { id: 'finance', name: 'Finance', color: '#d97706', order: 3 },
  ],
  entries: [
    // Product: a sequence with one overlap and milestones on the same line
    { id: 'p1', name: 'Discovery', start: '2026-01-05', end: '2026-02-13', timelineId: 'product' },
    { id: 'p2', name: 'Design', start: '2026-02-02', end: '2026-03-20', timelineId: 'product' },
    { id: 'p3', name: 'Build v1', start: '2026-03-23', end: '2026-06-12', timelineId: 'product' },
    { id: 'p4', name: 'Beta', start: '2026-05-04', end: '2026-05-04', timelineId: 'product' },
    { id: 'p5', name: 'Launch', start: '2026-06-15', end: '2026-06-15', timelineId: 'product' },

    // Marketing: two parallel campaigns
    { id: 'm1', name: 'Brand refresh', start: '2026-02-16', end: '2026-04-10', timelineId: 'marketing' },
    { id: 'm2', name: 'Pre-launch campaign', start: '2026-04-01', end: '2026-06-14', timelineId: 'marketing' },
    { id: 'm3', name: 'Website live', start: '2026-04-13', end: '2026-04-13', timelineId: 'marketing' },
    { id: 'm4', name: 'Launch event', start: '2026-06-15', end: '2026-06-19', timelineId: 'marketing' },

    // Hiring: milestones only, close together
    { id: 'h1', name: 'Designer starts', start: '2026-01-19', end: '2026-01-19', timelineId: 'hiring' },
    { id: 'h2', name: '2 engineers start', start: '2026-03-02', end: '2026-03-02', timelineId: 'hiring' },
    { id: 'h3', name: 'Support lead starts', start: '2026-03-09', end: '2026-03-09', timelineId: 'hiring' },

    // Finance: non-overlapping bars + quarter-end milestones
    { id: 'f1', name: 'Seed round', start: '2026-01-12', end: '2026-02-27', timelineId: 'finance' },
    { id: 'f2', name: 'Q1 close', start: '2026-03-31', end: '2026-03-31', timelineId: 'finance' },
    { id: 'f3', name: 'Budget review', start: '2026-04-20', end: '2026-05-08', timelineId: 'finance' },
    { id: 'f4', name: 'Q2 close', start: '2026-06-30', end: '2026-06-30', timelineId: 'finance' },
  ],
  settings: { overlapMode: 'sublanes', scale: 'month', showToday: true },
};
