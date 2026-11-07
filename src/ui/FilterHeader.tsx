import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isFieldActive, type FilterField } from '../model/filter';
import type { Timeline } from '../model/types';
import { useStore } from '../state/store';
import { useDismiss } from './useDismiss';

type Props = {
  field: FilterField;
  label: ReactNode;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timelines: Timeline[];
};

/** A column title that opens a filter pop-up when clicked. */
export function FilterHeader({ field, label, title, open, onOpenChange, timelines }: Props) {
  const filter = useStore((s) => s.filter);
  const active = isFieldActive(filter, field);
  const ref = useRef<HTMLTableCellElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // The table scrolls inside its own box, which would cut off the pop-up, so it is
  // positioned relative to the window, right under the column title.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 260)) });
  }, [open]);

  // Close on a click outside, on Escape, or when the page scrolls (the pop-up would drift).
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useDismiss(open, close, ref, { closeOnScroll: true, scrollSafeRef: popRef });

  return (
    <th ref={ref} className="filter-th">
      <button
        className={`th-button${active ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={title ? `${title} – click to filter` : 'Click to filter'}
        onClick={() => onOpenChange(!open)}
      >
        {label}
        <FunnelIcon filled={active} />
      </button>
      {open && pos && (
        <div ref={popRef} className="filter-popover" role="dialog" aria-label="Filter" style={pos}>
          <FilterBody field={field} timelines={timelines} />
        </div>
      )}
    </th>
  );
}

function FilterBody({ field, timelines }: { field: FilterField; timelines: Timeline[] }) {
  const filter = useStore((s) => s.filter);
  const { setFilter, clearFilterField } = useStore.getState();
  const clear = (
    <button className="link" onClick={() => clearFilterField(field)} disabled={!isFieldActive(filter, field)}>
      Clear this filter
    </button>
  );

  switch (field) {
    case 'name':
      return (
        <>
          <label className="filter-label">
            Name contains
            <input
              autoFocus
              value={filter.name ?? ''}
              placeholder="e.g. launch"
              onChange={(e) => setFilter({ name: e.target.value })}
            />
          </label>
          {clear}
        </>
      );

    case 'kind':
      return (
        <>
          <div className="filter-label">Show</div>
          {(
            [
              [undefined, 'Everything'],
              ['milestone', 'Milestones only ◆'],
              ['bar', 'Bars only ▬'],
            ] as const
          ).map(([value, text]) => (
            <label key={text} className="filter-option">
              <input type="radio" name="kind-filter" checked={filter.kind === value} onChange={() => setFilter({ kind: value })} />
              {text}
            </label>
          ))}
        </>
      );

    case 'start':
    case 'end': {
      const fromKey = field === 'start' ? 'startFrom' : 'endFrom';
      const toKey = field === 'start' ? 'startTo' : 'endTo';
      return (
        <>
          <div className="filter-label">{field === 'start' ? 'Start date' : 'End date'} between</div>
          <label className="filter-option">
            From
            <input type="date" value={filter[fromKey] ?? ''} onChange={(e) => setFilter({ [fromKey]: e.target.value || undefined })} />
          </label>
          <label className="filter-option">
            To
            <input type="date" value={filter[toKey] ?? ''} onChange={(e) => setFilter({ [toKey]: e.target.value || undefined })} />
          </label>
          {clear}
        </>
      );
    }

    case 'timeline': {
      const selected = new Set(filter.timelineIds ?? []);
      const toggle = (id: string, on: boolean) => {
        const next = new Set(selected);
        if (on) next.add(id);
        else next.delete(id);
        setFilter({ timelineIds: [...next] });
      };
      return (
        <>
          <div className="filter-label">Show timelines</div>
          {timelines.map((t) => (
            <label key={t.id} className="filter-option">
              <input type="checkbox" checked={selected.has(t.id)} onChange={(e) => toggle(t.id, e.target.checked)} />
              <span className="swatch" style={{ background: t.color }} />
              {t.name}
            </label>
          ))}
          <p className="filter-hint">Nothing ticked = all timelines.</p>
          {clear}
        </>
      );
    }
  }
}

function FunnelIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" className="funnel">
      <path
        d="M1.5 2h13l-5 6.2V14l-3-1.5V8.2z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
