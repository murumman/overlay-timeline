import { useStore } from '../state/store';

export function TimelinePanel() {
  const project = useStore((s) => s.project);
  const shownIds = useStore((s) => s.filter.timelineIds);
  const { addTimeline, updateTimeline, moveTimeline, deleteTimeline, toggleTimelineFilter, clearFilterField } =
    useStore.getState();
  const timelines = [...project.timelines].sort((a, b) => a.order - b.order);
  const countFor = (id: string) => project.entries.filter((e) => e.timelineId === id).length;
  const showingAll = !shownIds?.length;
  const isOnly = (id: string) => shownIds?.length === 1 && shownIds[0] === id;

  const onDelete = (id: string, name: string) => {
    const n = countFor(id);
    if (n === 0 || window.confirm(`Delete the timeline “${name}” and its ${n} entr${n === 1 ? 'y' : 'ies'}?`)) {
      deleteTimeline(id);
    }
  };

  return (
    <section className="panel timelines">
      <div className="panel-head">
        <h2>Timelines</h2>
        <button className="primary" onClick={() => addTimeline()}>
          + Add
        </button>
      </div>

      <label className="show-all">
        <input type="radio" name="timeline-only" checked={showingAll} onChange={() => clearFilterField('timeline')} />
        All timelines
      </label>

      <ul>
        {timelines.map((t, i) => (
          <li key={t.id} className={shownIds?.length && !shownIds.includes(t.id) ? 'dimmed' : undefined}>
            <input
              type="radio"
              name="timeline-only"
              checked={isOnly(t.id)}
              aria-label={`Show only ${t.name}`}
              title="Show only this timeline"
              onChange={() => toggleTimelineFilter(t.id)}
              onClick={() => isOnly(t.id) && toggleTimelineFilter(t.id)}
            />
            <input
              type="color"
              value={t.color}
              aria-label={`Colour of ${t.name}`}
              onChange={(e) => updateTimeline(t.id, { color: e.target.value })}
            />
            <input
              className="name"
              value={t.name}
              aria-label="Timeline name"
              onChange={(e) => updateTimeline(t.id, { name: e.target.value })}
            />
            <span className="count" title="Entries on this timeline">
              {countFor(t.id)}
            </span>
            <button aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => moveTimeline(t.id, -1)}>
              ↑
            </button>
            <button
              aria-label="Move down"
              title="Move down"
              disabled={i === timelines.length - 1}
              onClick={() => moveTimeline(t.id, 1)}
            >
              ↓
            </button>
            <button aria-label="Delete timeline" title="Delete timeline" className="danger" onClick={() => onDelete(t.id, t.name)}>
              ✕
            </button>
          </li>
        ))}
        {timelines.length === 0 && <li className="empty">No timelines yet.</li>}
      </ul>
    </section>
  );
}
