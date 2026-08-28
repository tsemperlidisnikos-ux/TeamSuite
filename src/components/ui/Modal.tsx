import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  wide?: boolean;
  fullscreen?: boolean;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  className = '',
  wide = false,
  fullscreen = false,
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      className={`modal-backdrop${fullscreen ? ' modal-backdrop--fullscreen' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`modal ${wide ? 'modal--wide' : ''} ${fullscreen ? 'modal--fullscreen' : ''} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <Button variant="ghost" type="button" onClick={onClose} aria-label="Κλείσιμο">
            <X size={18} />
          </Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
