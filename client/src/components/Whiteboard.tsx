import { useRef, useEffect, useCallback } from 'react';
import type { Stroke, Point } from '../lib/protocol';
import { renderAllStrokes } from '../lib/canvas';

interface WhiteboardProps {
  strokes: Stroke[];
  tool: 'pen' | 'eraser';
  onStartStroke: (point: Point) => string | null;
  onAddPoints: (strokeId: string, points: Point[]) => void;
  onEndStroke: (strokeId: string) => void;
}

export function Whiteboard({
  strokes,
  tool,
  onStartStroke,
  onAddPoints,
  onEndStroke,
}: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeStrokeRef = useRef<string | null>(null);
  const pointBufferRef = useRef<Point[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      renderAllStrokes(ctx, strokes, rect.width, rect.height);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderAllStrokes(ctx, strokes, w, h);
  }, [strokes]);

  const getPoint = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e) {
      clientX = e.touches[0]?.clientX ?? (e as any).changedTouches[0].clientX;
      clientY = e.touches[0]?.clientY ?? (e as any).changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }, []);

  const flushPoints = useCallback(() => {
    if (activeStrokeRef.current && pointBufferRef.current.length > 0) {
      onAddPoints(activeStrokeRef.current, [...pointBufferRef.current]);
      pointBufferRef.current = [];
    }
  }, [onAddPoints]);

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      isDrawingRef.current = true;
      const point = getPoint(e);
      const strokeId = onStartStroke(point);
      activeStrokeRef.current = strokeId;
      pointBufferRef.current = [];
    },
    [getPoint, onStartStroke],
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      e.preventDefault();
      const point = getPoint(e);
      pointBufferRef.current.push(point);

      if (!flushTimerRef.current) {
        flushTimerRef.current = window.setTimeout(() => {
          flushPoints();
          flushTimerRef.current = null;
        }, 30);
      }
    },
    [getPoint, flushPoints],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    isDrawingRef.current = false;

    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushPoints();

    onEndStroke(activeStrokeRef.current);
    activeStrokeRef.current = null;
  }, [flushPoints, onEndStroke]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  return (
    <div className="whiteboard-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className={`whiteboard-canvas ${tool === 'eraser' ? 'eraser-cursor' : ''}`}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />
    </div>
  );
}
