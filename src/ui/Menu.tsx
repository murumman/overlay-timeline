import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from './useDismiss';

export type MenuItem =
  | { label: ReactNode; hint?: string; onSelect: () => void; danger?: boolean }
  | { separator: string };

/** A button that opens a dropdown list of actions. */
export function Menu({ label, items, align = 'left' }: { label: ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);

  return (
    <div className="menu" ref={ref}>
      <button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`menu-list ${align}`} role="menu">
          {items.map((item, i) =>
            'separator' in item ? (
              <div key={i} className="menu-separator" role="presentation">
                {item.separator}
              </div>
            ) : (
              <button
                key={i}
                role="menuitem"
                className={item.danger ? 'danger' : undefined}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span>{item.label}</span>
                {item.hint && <small>{item.hint}</small>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
