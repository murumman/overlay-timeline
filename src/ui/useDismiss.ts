import { useEffect, type RefObject } from 'react';

/**
 * While `open`, calls `onClose` on a mouse press outside `containerRef`, on Escape,
 * on window resize, and (if `closeOnScroll`) when anything outside `scrollSafeRef` scrolls.
 */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
  options: { closeOnScroll?: boolean; scrollSafeRef?: RefObject<HTMLElement | null> } = {},
): void {
  const { closeOnScroll = false, scrollSafeRef } = options;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onScroll = (e: Event) => {
      if (!scrollSafeRef?.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    if (closeOnScroll) document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      if (closeOnScroll) document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, onClose, containerRef, closeOnScroll, scrollSafeRef]);
}
