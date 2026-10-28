import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface Stroke {
  points: Array<{ x: number; y: number }>;
}

export interface SignaturePadHandle {
  clear: () => void;
  undo: () => void;
  toDataURL: () => string | null;
  isEmpty: () => boolean;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { color?: string }>(
  function SignaturePad({ color = '#171614' }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const drawingRef = useRef<Stroke | null>(null);
    const [version, setVersion] = useState(0);

    const redraw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth || 600;
      const height = canvas.clientHeight || 218;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.strokeStyle = color;
      context.lineWidth = 2.4;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (const stroke of strokesRef.current) {
        if (stroke.points.length === 0) continue;
        context.beginPath();
        context.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let index = 1; index < stroke.points.length; index += 1) {
          const point = stroke.points[index];
          const previous = stroke.points[index - 1];
          const midX = (previous.x + point.x) / 2;
          const midY = (previous.y + point.y) / 2;
          context.quadraticCurveTo(previous.x, previous.y, midX, midY);
        }
        const last = stroke.points[stroke.points.length - 1];
        context.lineTo(last.x, last.y);
        context.stroke();
      }
    };

    useEffect(() => {
      redraw();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const observer = new ResizeObserver(() => redraw());
      observer.observe(canvas);
      return () => observer.disconnect();
      // Redraw is intentionally a render-local canvas painter.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      redraw();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [version]);

    useImperativeHandle(ref, () => ({
      clear: () => {
        strokesRef.current = [];
        drawingRef.current = null;
        setVersion((value) => value + 1);
      },
      undo: () => {
        strokesRef.current = strokesRef.current.slice(0, -1);
        setVersion((value) => value + 1);
      },
      toDataURL: () => {
        if (strokesRef.current.length === 0) return null;
        return canvasRef.current?.toDataURL('image/png') ?? null;
      },
      isEmpty: () => strokesRef.current.length === 0,
    }));

    const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    return (
      <canvas
        ref={canvasRef}
        className="signature-pad"
        aria-label="Signature drawing area"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const stroke: Stroke = { points: [point(event)] };
          drawingRef.current = stroke;
          strokesRef.current = [...strokesRef.current, stroke];
          redraw();
        }}
        onPointerMove={(event) => {
          const stroke = drawingRef.current;
          if (!stroke) return;
          stroke.points.push(point(event));
          redraw();
        }}
        onPointerUp={(event) => {
          if (!drawingRef.current) return;
          drawingRef.current = null;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // Capture may already be released.
          }
          setVersion((value) => value + 1);
        }}
        onPointerCancel={() => {
          drawingRef.current = null;
        }}
      />
    );
  },
);
