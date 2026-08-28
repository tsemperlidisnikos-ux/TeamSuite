import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

type Align = 'left' | 'right';

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: Align;
  panelClassName?: string;
  backdropClassName?: string;
  offset?: number;
};

export function AppPopupLayer({
  open,
  onClose,
  anchorRef,
  children,
  align = 'right',
  panelClassName = '',
  backdropClassName = '',
  offset = 4,
}: Props) {
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle({ visibility: 'hidden' });
      return;
    }

    function position() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const top = rect.bottom + offset;
      const base: CSSProperties = {
        top,
        visibility: 'visible',
        maxHeight: Math.max(120, window.innerHeight - top - 8),
      };
      if (align === 'right') {
        setPanelStyle({
          ...base,
          right: Math.max(8, window.innerWidth - rect.right),
        });
      } else {
        setPanelStyle({
          ...base,
          left: Math.max(8, rect.left),
        });
      }
    }

    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, anchorRef, align, offset]);

  useLayoutEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <button
        type="button"
        className={`app-popup-backdrop ${backdropClassName}`.trim()}
        aria-label="Κλείσιμο"
        onClick={onClose}
      />
      <div className={`app-popup-panel ${panelClassName}`.trim()} style={panelStyle}>
        {children}
      </div>
    </>,
    document.body,
  );
}
