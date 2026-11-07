import { useEffect, useState, type ReactNode } from 'react';
import { isFilterActive, matchesFilter, type FilterField } from '../model/filter';
import { isMilestone, type Entry, type Timeline } from '../model/types';
import { validateEntry, type EntryIssue } from '../model/validation';
import { useStore } from '../state/store';
import { FilterHeader } from './FilterHeader';

const NEW_TIMELINE = '__new__';

export function EntryTable() {
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedEntryId);
  const filter = useStore((s) => s.filter);
  const { addEntry, sortEntries, resetFilter } = useStore.getState();
  const timelines = [...project.timelines].sort((a, b) => a.order - b.order);
  const [openFilter, setOpenFilter] = useState<FilterField | null>(null);
  const filtering = isFilterActive(filter);
  const shown = filtering ? project.entries.filter((e) => matchesFilter(e, filter)) : project.entries;

  const header = (field: FilterField, label: ReactNode, title?: string) => (
    <FilterHeader
      field={field}
      label={label}
      title={title}
      timelines={timelines}
      open={openFilter === field}
      onOpenChange={(o) => setOpenFilter(o ? field : null)}
    />
  );

  // When an item is clicked in the chart, bring its row into view.
  useEffect(() => {
    if (selectedId) document.getElementById(`entry-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  return (
    <section className="panel entries">
      <div className="panel-head">
        <h2>
          Entries ({filtering ? `${shown.length} of ${project.entries.length}` : project.entries.length})
        </h2>
        <div className="panel-actions">
          {filtering && (
            <button className="reset-filter" onClick={resetFilter} title="Show all entries again">
              ✕ Reset filters
            </button>
          )}
          <button onClick={sortEntries} title="Sort by timeline, then start date">
            Sort
          </button>
          <button className="primary" onClick={() => addEntry()}>
            + Add entry
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {header('name', 'Name')}
              {header('kind', '◆', 'Milestone: a single date, shown as a diamond')}
              {header('start', 'Start')}
              {header('end', 'End')}
              {header('timeline', 'Timeline')}
              <th title="Colour (leave as is to use the timeline colour)">Colour</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                timelines={timelines}
                selected={e.id === selectedId}
                issues={validateEntry(e, project.timelines)}
              />
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  {project.entries.length === 0 ? (
                    'No entries yet. Click “+ Add entry” or import a CSV file.'
                  ) : (
                    <>
                      No entries match the filter.{' '}
                      <button className="link" onClick={resetFilter}>
                        Reset filters
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EntryRow({
  entry: e,
  timelines,
  selected,
  issues,
}: {
  entry: Entry;
  timelines: Timeline[];
  selected: boolean;
  issues: EntryIssue[];
}) {
  const { updateEntry, setMilestone, duplicateEntry, deleteEntry, select, addTimeline } = useStore.getState();
  const milestone = isMilestone(e);
  const issue = (field: EntryIssue['field']) => issues.find((i) => i.field === field)?.message;
  const timelineColor = timelines.find((t) => t.id === e.timelineId)?.color ?? '#888888';

  const onTimelineChange = (value: string) => {
    if (value !== NEW_TIMELINE) return updateEntry(e.id, { timelineId: value });
    const name = window.prompt('Name of the new timeline:');
    if (name?.trim()) updateEntry(e.id, { timelineId: addTimeline(name) });
  };

  return (
    <tr id={`entry-${e.id}`} className={selected ? 'selected' : undefined} onFocus={() => select(e.id)}>
      <td>
        <input
          className="name"
          value={e.name}
          aria-label="Name"
          aria-invalid={!!issue('name')}
          title={issue('name')}
          onChange={(ev) => updateEntry(e.id, { name: ev.target.value })}
        />
      </td>
      <td className="center">
        <input
          type="checkbox"
          checked={milestone}
          aria-label="Milestone"
          title="Milestone (single date)"
          onChange={(ev) => setMilestone(e.id, ev.target.checked)}
        />
      </td>
      <td>
        <input
          type="date"
          value={e.start}
          aria-label="Start date"
          aria-invalid={!!issue('start')}
          title={issue('start')}
          onChange={(ev) => updateEntry(e.id, { start: ev.target.value })}
        />
      </td>
      <td>
        <input
          type="date"
          value={e.end}
          disabled={milestone}
          aria-label="End date"
          aria-invalid={!!issue('end')}
          title={issue('end') ?? (milestone ? 'Milestones have no end date' : undefined)}
          onChange={(ev) => updateEntry(e.id, { end: ev.target.value })}
        />
      </td>
      <td>
        <select
          value={e.timelineId}
          aria-label="Timeline"
          aria-invalid={!!issue('timelineId')}
          onChange={(ev) => onTimelineChange(ev.target.value)}
        >
          {!timelines.some((t) => t.id === e.timelineId) && <option value={e.timelineId}>(missing)</option>}
          {timelines.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value={NEW_TIMELINE}>+ New timeline…</option>
        </select>
      </td>
      <td className="color-cell">
        <input
          type="color"
          value={e.color ?? timelineColor}
          aria-label="Colour"
          title={e.color ? 'Own colour' : 'Timeline colour'}
          onChange={(ev) => updateEntry(e.id, { color: ev.target.value })}
        />
        {e.color && (
          <button className="link" title="Use the timeline colour again" onClick={() => updateEntry(e.id, { color: undefined })}>
            reset
          </button>
        )}
      </td>
      <td className="row-actions">
        <button title="Duplicate" aria-label="Duplicate" onClick={() => duplicateEntry(e.id)}>
          ⧉
        </button>
        <button title="Delete" aria-label="Delete" className="danger" onClick={() => deleteEntry(e.id)}>
          ✕
        </button>
      </td>
    </tr>
  );
}
