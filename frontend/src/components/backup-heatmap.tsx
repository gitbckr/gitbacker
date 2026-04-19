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

const CELL_SIZE = 11;
const CELL_GAP = 3;
const TOTAL_CELL = CELL_SIZE + CELL_GAP;
const ROWS = 7;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type CellTone =
  | "empty"
  | "ok-1"
  | "ok-2"
  | "ok-3"
  | "ok-4"
  | "mixed"
  | "fail";

function getCellTone(entry: DailyActivity | undefined): CellTone {
  if (!entry || entry.total === 0) return "empty";
  if (entry.failed > 0 && entry.succeeded === 0) return "fail";
  if (entry.failed > 0 && entry.succeeded > 0) return "mixed";
  if (entry.total >= 20) return "ok-4";
  if (entry.total >= 10) return "ok-3";
  if (entry.total >= 3) return "ok-2";
  return "ok-1";
}

function cellFill(tone: CellTone): string {
  switch (tone) {
    case "empty":
      return "color-mix(in oklch, var(--foreground) 6%, transparent)";
    case "ok-1":
      return "color-mix(in oklch, var(--mint) 22%, transparent)";
    case "ok-2":
      return "color-mix(in oklch, var(--mint) 45%, transparent)";
    case "ok-3":
      return "color-mix(in oklch, var(--mint) 70%, transparent)";
    case "ok-4":
      return "var(--mint)";
    case "mixed":
      return "color-mix(in oklch, var(--warn) 70%, transparent)";
    case "fail":
      return "color-mix(in oklch, var(--err) 75%, transparent)";
  }
}

function formatDate(d: Date): string {
  // Use local components. toISOString() converts to UTC first, which shifts
  // the calendar day by one for users east of UTC and desyncs cell keys from
  // the backend's UTC-day-based date strings in the opposite direction.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHuman(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BackupHeatmap({ data, isLoading }: Props) {
  const { grid, monthLabels, lookup, totals } = useMemo(() => {
    const lookup = new Map<string, DailyActivity>();
    let totalSucceeded = 0;
    let totalFailed = 0;
    let activeDays = 0;
    for (const entry of data) {
      lookup.set(entry.date, entry);
      totalSucceeded += entry.succeeded;
      totalFailed += entry.failed;
      if (entry.total > 0) activeDays += 1;
    }

    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const days: { date: Date; dateStr: string }[] = [];
    const cursor = new Date(yearStart);
    while (cursor <= yearEnd) {
      days.push({ date: new Date(cursor), dateStr: formatDate(cursor) });
      cursor.setDate(cursor.getDate() + 1);
    }

    const columns: (typeof days[number] | null)[][] = [];
    const firstDow = days[0].date.getDay();
    const firstCol: (typeof days[number] | null)[] = [];
    for (let r = 0; r < firstDow; r++) firstCol.push(null);
    let dayIdx = 0;
    while (firstCol.length < ROWS && dayIdx < days.length) {
      firstCol.push(days[dayIdx++]);
    }
    columns.push(firstCol);
    while (dayIdx < days.length) {
      const col: (typeof days[number] | null)[] = [];
      for (let r = 0; r < ROWS && dayIdx < days.length; r++) {
        col.push(days[dayIdx++]);
      }
      columns.push(col);
    }

    const labels: { text: string; col: number }[] = [];
    let lastMonth = -1;
    for (let c = 0; c < columns.length; c++) {
      const entry = columns[c].find((e) => e !== null);
      if (entry) {
        const month = entry.date.getMonth();
        if (month !== lastMonth) {
          labels.push({ text: MONTH_NAMES[month], col: c });
          lastMonth = month;
        }
      }
    }

    return {
      grid: columns,
      monthLabels: labels,
      lookup,
      totals: { succeeded: totalSucceeded, failed: totalFailed, activeDays, year },
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4 text-[11px]">
          <div className="h-3 w-24 rounded bg-foreground/[0.06] animate-pulse" />
          <div className="h-3 w-20 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
        <div
          className="animate-pulse rounded-md bg-foreground/[0.04]"
          style={{
            width: 53 * TOTAL_CELL + 32,
            height: ROWS * TOTAL_CELL + 20,
          }}
        />
      </div>
    );
  }

  const LEFT_PAD = 24;
  const TOP_PAD = 16;
  const svgWidth = LEFT_PAD + grid.length * TOTAL_CELL;
  const svgHeight = TOP_PAD + ROWS * TOTAL_CELL;

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[11.5px] text-muted-foreground tabular-nums">
        <span>
          <span className="text-foreground font-medium tabular-nums">
            {totals.succeeded.toLocaleString()}
          </span>{" "}
          successful backups in {totals.year}
        </span>
        {totals.failed > 0 && (
          <span style={{ color: "var(--err)" }}>
            <span className="font-medium tabular-nums">
              {totals.failed.toLocaleString()}
            </span>{" "}
            failed
          </span>
        )}
        <span>
          <span className="text-foreground font-medium tabular-nums">
            {totals.activeDays}
          </span>{" "}
          active days
        </span>
      </div>

      <TooltipProvider>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            width={svgWidth}
            height={svgHeight}
            className="block max-w-full h-auto"
            role="img"
            aria-label="Backup activity heatmap"
          >
            {monthLabels.map((ml) => (
              <text
                key={`${ml.text}-${ml.col}`}
                x={LEFT_PAD + ml.col * TOTAL_CELL}
                y={10}
                fill="currentColor"
                className="text-muted-foreground"
                fontSize={9.5}
                fontWeight={500}
                letterSpacing="0.04em"
              >
                {ml.text.toUpperCase()}
              </text>
            ))}

            {DAY_LABELS.map((label, i) =>
              label ? (
                <text
                  key={i}
                  x={0}
                  y={TOP_PAD + i * TOTAL_CELL + CELL_SIZE - 2}
                  fill="currentColor"
                  className="text-muted-foreground"
                  fontSize={9}
                >
                  {label}
                </text>
              ) : null,
            )}

            {grid.map((col, c) =>
              col.map((cell, r) => {
                if (!cell) return null;
                const entry = lookup.get(cell.dateStr);
                const tone = getCellTone(entry);
                const x = LEFT_PAD + c * TOTAL_CELL;
                const y = TOP_PAD + r * TOTAL_CELL;

                return (
                  <Tooltip key={cell.dateStr}>
                    <TooltipTrigger asChild>
                      <foreignObject
                        x={x}
                        y={y}
                        width={CELL_SIZE}
                        height={CELL_SIZE}
                      >
                        <div
                          className="h-full w-full rounded-[2.5px] transition-[filter] hover:brightness-125"
                          style={{
                            background: cellFill(tone),
                            outline:
                              tone === "empty"
                                ? "1px solid color-mix(in oklch, var(--foreground) 4%, transparent)"
                                : "1px solid color-mix(in oklch, var(--foreground) 6%, transparent)",
                            outlineOffset: "-1px",
                          }}
                        />
                      </foreignObject>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground text-[12px]">
                          {formatHuman(cell.date)}
                        </p>
                        {entry && entry.total > 0 ? (
                          <p className="text-[11.5px] text-muted-foreground tabular-nums">
                            <span style={{ color: "var(--mint)" }}>
                              {entry.succeeded}
                            </span>{" "}
                            succeeded
                            {entry.failed > 0 && (
                              <>
                                {" · "}
                                <span style={{ color: "var(--err)" }}>
                                  {entry.failed} failed
                                </span>
                              </>
                            )}
                          </p>
                        ) : (
                          <p className="text-[11.5px] text-muted-foreground">
                            No backups
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              }),
            )}
          </svg>
        </div>
      </TooltipProvider>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          {(["empty", "ok-1", "ok-2", "ok-3", "ok-4"] as CellTone[]).map((t) => (
            <span
              key={t}
              className="inline-block size-2.5 rounded-[2.5px]"
              style={{ background: cellFill(t) }}
            />
          ))}
          <span>More</span>
        </div>
        <div className="h-3 w-px bg-foreground/[0.08]" />
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-[2.5px]"
            style={{ background: cellFill("mixed") }}
          />
          <span>Mixed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-[2.5px]"
            style={{ background: cellFill("fail") }}
          />
          <span>Failed</span>
        </div>
      </div>
    </div>
  );
}
