import { newId } from '../model/operations';
import { TIME_SCALES, type Entry, type Project, type Settings, type Timeline } from '../model/types';

/** Marker so we can recognise our own backup files. */
const FORMAT = 'overlay-timeline';
const FORMAT_VERSION = 1;

/** A full backup of the project (all entries, unfiltered) as pretty-printed JSON. */
export function projectToJson(p: Project, savedAt = new Date().toISOString()): string {
  return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, savedAt, project: p }, null, 2) + '\n';
}

export type JsonImportResult = { ok: true; project: Project; warnings: string[] } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Reads a backup file. Accepts our wrapped format or a bare project object.
 * Broken items are dropped with a warning instead of failing the whole import.
 */
export function parseProjectJson(text: string, fallbackSettings: Settings): JsonImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  const raw = isObj(data) && isObj(data.project) ? data.project : data;
  if (!isObj(raw) || !Array.isArray(raw.entries) || !Array.isArray(raw.timelines)) {
    return { ok: false, error: 'This is not an Overlay Timeline backup (no "entries" and "timelines" found).' };
  }

  const warnings: string[] = [];
  const seen = new Set<string>();
  const uniqueId = (v: unknown) => {
    let id = str(v) || newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    return id;
  };

  const timelines: Timeline[] = [];
  raw.timelines.forEach((t, i) => {
    if (!isObj(t) || !str(t.name)) return void warnings.push(`Timeline #${i + 1} skipped (no name).`);
    timelines.push({
      id: uniqueId(t.id),
      name: str(t.name)!,
      color: /^#[0-9a-f]{6}$/i.test(str(t.color) ?? '') ? str(t.color)! : '#4b5563',
      order: typeof t.order === 'number' ? t.order : i,
      ...(t.collapsed === true ? { collapsed: true } : {}),
    });
  });

  seen.clear();
  const entries: Entry[] = [];
  raw.entries.forEach((e, i) => {
    if (!isObj(e) || str(e.start) === undefined || str(e.end) === undefined || !str(e.timelineId)) {
      return void warnings.push(`Entry #${i + 1} skipped (missing dates or timeline).`);
    }
    entries.push({
      id: uniqueId(e.id),
      name: str(e.name) ?? '',
      start: str(e.start)!,
      end: str(e.end)!,
      timelineId: str(e.timelineId)!,
      ...(str(e.color) ? { color: str(e.color)! } : {}),
      ...(str(e.notes) ? { notes: str(e.notes)! } : {}),
    });
  });

  const s = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = {
    overlapMode: s.overlapMode === 'singleLine' ? 'singleLine' : s.overlapMode === 'sublanes' ? 'sublanes' : fallbackSettings.overlapMode,
    scale: s.scale === 'auto' || TIME_SCALES.includes(s.scale as never) ? (s.scale as Settings['scale']) : fallbackSettings.scale,
    showToday: typeof s.showToday === 'boolean' ? s.showToday : fallbackSettings.showToday,
    ...(typeof s.spanYears === 'number' ? { spanYears: s.spanYears } : {}),
    ...(typeof s.spanStartYear === 'number' ? { spanStartYear: s.spanStartYear } : {}),
  };

  return { ok: true, project: { entries, timelines, settings }, warnings };
}
