import { useCallback, useEffect, useRef } from 'react';

type Props = {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  id?: string;
};

function getPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export function SignaturePad({ value, onChange, disabled = false, id }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = 140;
    if (canvas.width !== width || canvas.height !== height) {
      const ctx = canvas.getContext('2d');
      const image = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = width;
      canvas.height = height;
      const next = canvas.getContext('2d');
      if (next) {
        next.fillStyle = '#fff';
        next.fillRect(0, 0, width, height);
        next.strokeStyle = '#1e293b';
        next.lineWidth = 2;
        next.lineCap = 'round';
        next.lineJoin = 'round';
        if (image && image.width > 0 && image.height > 0) {
          next.putImageData(image, 0, 0);
        }
      }
    }
  }, []);

  useEffect(() => {
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || value) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
  }, [value]);

  function exportSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) {
      onChange('');
      return;
    }
    onChange(canvas.toDataURL('image/png'));
  }

  function startDraw(x: number, y: number) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function drawTo(x: number, y: number) {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInkRef.current = true;
  }

  function endDraw() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    exportSignature();
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    onChange('');
  }

  return (
    <div className="signature-pad" id={id}>
      <canvas
        ref={canvasRef}
        className="signature-pad-canvas"
        aria-label="Πεδίο υπογραφής γονέα ή κηδεμόνα"
        onPointerDown={(e) => {
          e.preventDefault();
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.setPointerCapture(e.pointerId);
          const { x, y } = getPoint(canvas, e.clientX, e.clientY);
          startDraw(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const { x, y } = getPoint(canvas, e.clientX, e.clientY);
          drawTo(x, y);
        }}
        onPointerUp={() => endDraw()}
        onPointerLeave={() => endDraw()}
      />
      <div className="signature-pad-actions">
        <button type="button" className="btn btn-ghost" disabled={disabled} onClick={clear}>
          Καθαρισμός
        </button>
        <span className="muted signature-pad-hint">Υπογράψτε με το ποντίκι ή το δάχτυλο</span>
      </div>
    </div>
  );
}
