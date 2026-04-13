"use client";

import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DailyActivity } from "@/lib/api";

type Props = {
  data: DailyActivity[];
  isLoading?: boolean;
};

const CELL_SIZE = 13;
const CELL_GAP = 3;
const TOTAL_CELL = CELL_SIZE + CELL_GAP;
const ROWS = 7;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getCellColor(entry: DailyActivity | undefined): string {
  if (!entry) return "bg-muted";
  if (entry.total === 0) return "bg-muted";
  if (entry.failed > 0 && entry.succeeded === 0) return "bg-red-400";
  if (entry.failed > 0 && entry.succeeded > 0) return "bg-amber-400";
  // All succeeded — scale by volume
  if (entry.total >= 10) return "bg-emerald-600";
  if (entry.total >= 3) return "bg-emerald-400";
  return "bg-emerald-200";
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function BackupHeatmap({ data, isLoading }: Props) {
  const { grid, monthLabels, lookup } = useMemo(() => {
    const lookup = new Map<string, DailyActivity>();
    for (const entry of data) {
      lookup.set(entry.date, entry);
    }

    // Show full current year: Jan 1 through Dec 31
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const days: { date: Date; dateStr: string }[] = [];
    const cursor = new Date(yearStart);
    while (cursor <= yearEnd) {
      days.push({ date: new Date(cursor), dateStr: formatDate(cursor) });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Organize into columns (weeks). First column may be partial.
    const columns: (typeof days[number] | null)[][] = [];
    let colIdx = 0;

    // Start: pad the first column so day[0] lands on correct row
    const firstDow = days[0].date.getDay(); // 0=Sun
    const firstCol: (typeof days[number] | null)[] = [];
    for (let r = 0; r < firstDow; r++) firstCol.push(null);
    let dayIdx = 0;
    while (firstCol.length < ROWS && dayIdx < days.length) {
      firstCol.push(days[dayIdx++]);
    }
    columns.push(firstCol);

    // Remaining full columns
    while (dayIdx < days.length) {
      const col: (typeof days[number] | null)[] = [];
      for (let r = 0; r < ROWS && dayIdx < days.length; r++) {
        col.push(days[dayIdx++]);
      }
      columns.push(col);
    }

    // Month labels
    const labels: { text: string; col: number }[] = [];
    let lastMonth = -1;
    for (let c = 0; c < columns.length; c++) {
      // Find first non-null entry in column
      const entry = columns[c].find((e) => e !== null);
      if (entry) {
        const month = entry.date.getMonth();
        if (month !== lastMonth) {
          labels.push({ text: MONTH_NAMES[month], col: c });
          lastMonth = month;
        }
      }
    }

    return { grid: columns, monthLabels: labels, lookup };
  }, [data]);

  if (isLoading) {
    const skeletonCols = 53;
    return (
      <div className="overflow-x-auto">
        <div
          className="animate-pulse rounded bg-muted"
          style={{
            width: skeletonCols * TOTAL_CELL,
            height: ROWS * TOTAL_CELL + 20,
          }}
        />
      </div>
    );
  }

  const LEFT_PAD = 32;
  const TOP_PAD = 18;
  const svgWidth = LEFT_PAD + grid.length * TOTAL_CELL;
  const svgHeight = TOP_PAD + ROWS * TOTAL_CELL;

  return (
    <div className="space-y-2">
      <TooltipProvider>
        <div>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="block w-full h-auto"
            role="img"
            aria-label="Backup activity heatmap"
          >
            {/* Month labels */}
            {monthLabels.map((ml) => (
              <text
                key={`${ml.text}-${ml.col}`}
                x={LEFT_PAD + ml.col * TOTAL_CELL}
                y={12}
                className="fill-muted-foreground"
                fontSize={10}
              >
                {ml.text}
              </text>
            ))}

            {/* Day labels */}
            {DAY_LABELS.map((label, i) =>
              label ? (
                <text
                  key={i}
                  x={0}
                  y={TOP_PAD + i * TOTAL_CELL + CELL_SIZE - 2}
                  className="fill-muted-foreground"
                  fontSize={10}
                >
                  {label}
                </text>
              ) : null,
            )}

            {/* Grid cells — use foreignObject for Radix tooltips */}
            {grid.map((col, c) =>
              col.map((cell, r) => {
                if (!cell) return null;
                const entry = lookup.get(cell.dateStr);
                const color = getCellColor(entry);
                const x = LEFT_PAD + c * TOTAL_CELL;
                const y = TOP_PAD + r * TOTAL_CELL;
                const tipText = entry
                  ? `${cell.dateStr}: ${entry.succeeded} succeeded, ${entry.failed} failed`
                  : `${cell.dateStr}: No backups`;

                return (
                  <Tooltip key={cell.dateStr}>
                    <TooltipTrigger asChild>
                      <foreignObject x={x} y={y} width={CELL_SIZE} height={CELL_SIZE}>
                        <div
                          className={`h-full w-full rounded-sm ${color}`}
                          aria-label={tipText}
                        />
                      </foreignObject>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{tipText}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }),
            )}
          </svg>
        </div>
      </TooltipProvider>

      {/* Legend */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Less</span>
        <div className="h-3 w-3 rounded-sm bg-muted" />
        <div className="h-3 w-3 rounded-sm bg-emerald-200" />
        <div className="h-3 w-3 rounded-sm bg-emerald-400" />
        <div className="h-3 w-3 rounded-sm bg-emerald-600" />
        <span>More</span>
        <span className="ml-3">Mixed</span>
        <div className="h-3 w-3 rounded-sm bg-amber-400" />
        <span className="ml-3">Failed</span>
        <div className="h-3 w-3 rounded-sm bg-red-400" />
      </div>
    </div>
  );
}
