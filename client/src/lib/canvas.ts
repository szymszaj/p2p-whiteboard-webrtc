import type { Point, Stroke } from './protocol';

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const { points, tool, color, width } = stroke;
  if (points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;

  if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
  }

  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x * canvasWidth, p.y * canvasHeight, width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x * canvasWidth, points[0].y * canvasHeight);
    ctx.lineTo(points[1].x * canvasWidth, points[1].y * canvasHeight);
    ctx.stroke();
  } else {
    // Smooth curve through midpoints using quadratic Bézier
    ctx.beginPath();
    ctx.moveTo(points[0].x * canvasWidth, points[0].y * canvasHeight);

    for (let i = 1; i < points.length - 1; i++) {
      const xMid = ((points[i].x + points[i + 1].x) / 2) * canvasWidth;
      const yMid = ((points[i].y + points[i + 1].y) / 2) * canvasHeight;
      ctx.quadraticCurveTo(points[i].x * canvasWidth, points[i].y * canvasHeight, xMid, yMid);
    }

    // Last segment — draw straight to the final point
    const last = points[points.length - 1];
    ctx.lineTo(last.x * canvasWidth, last.y * canvasHeight);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderAllStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  for (const stroke of strokes) {
    drawStroke(ctx, stroke, canvasWidth, canvasHeight);
  }
}

export function eventToPoint(e: MouseEvent | Touch, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  };
}
