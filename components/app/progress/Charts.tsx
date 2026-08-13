"use client";

import { text } from "@/lib/theme";

/* Small hand-rolled charts. A charting library would be a lot of bytes for
   two plots that never need zooming, tooltips or panning. */

export type Point = { label: string; value: number };

/* Vertical bars with a dated axis — the daily study-minutes plot. */
export function BarChart({
  points,
  colour,
  emptyMessage,
}: {
  points: Point[];
  colour: string;
  emptyMessage: string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const hasData = points.some((point) => point.value > 0);

  /* Roughly four gridlines, on whole numbers. */
  const step = Math.max(1, Math.ceil(max / 4));
  const ticks = Array.from({ length: 5 }, (_, index) => index * step).filter(
    (tick) => tick <= step * 4,
  );
  const ceiling = step * 4;

  return (
    <div className="relative">
      {!hasData && (
        <p
          className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-[13.5px]"
          style={{ color: text(0.45) }}
        >
          {emptyMessage}
        </p>
      )}

      <div className="flex gap-2">
        <div
          className="flex w-6 shrink-0 flex-col-reverse justify-between py-0.5 text-right font-mono text-[10px]"
          style={{ color: text(0.35) }}
        >
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="relative flex h-[200px] items-end gap-[3px]"
            style={{
              backgroundImage: `repeating-linear-gradient(to top, ${text(0.07)} 0 1px, transparent 1px ${200 / 4}px)`,
            }}
          >
            {points.map((point) => (
              <div
                key={point.label}
                className="flex-1 rounded-t-[2px] transition-[height] duration-500"
                style={{
                  height: `${(point.value / ceiling) * 100}%`,
                  minHeight: point.value > 0 ? 3 : 0,
                  background: colour,
                }}
                title={`${point.label}: ${point.value}`}
              />
            ))}
          </div>

          <div
            className="mt-2 flex justify-between font-mono text-[9.5px]"
            style={{ color: text(0.35) }}
          >
            {points
              .filter((_, index) => index % Math.ceil(points.length / 8) === 0)
              .map((point) => (
                <span key={point.label}>{point.label}</span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* A single line, for the accuracy trend. */
export function LineChart({
  points,
  colour,
  emptyMessage,
}: {
  points: Point[];
  colour: string;
  emptyMessage: string;
}) {
  if (points.length < 2) {
    return (
      <p
        className="flex h-[200px] items-center justify-center px-6 text-center text-[13.5px]"
        style={{ color: text(0.45) }}
      >
        {emptyMessage}
      </p>
    );
  }

  const width = 100;
  const height = 40;
  const max = Math.max(1, ...points.map((point) => point.value));

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - (point.value / max) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[200px] w-full"
        aria-hidden="true"
      >
        {[0, 1, 2, 3, 4].map((line) => (
          <line
            key={line}
            x1={0}
            x2={width}
            y1={(line / 4) * height}
            y2={(line / 4) * height}
            stroke={text(0.07)}
            strokeWidth={0.3}
          />
        ))}
        <path
          d={path}
          fill="none"
          stroke={colour}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div
        className="mt-2 flex justify-between font-mono text-[9.5px]"
        style={{ color: text(0.35) }}
      >
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
