// src/components/shared/CalendarGrid.tsx
// Reusable month-grid calendar used by TutorDashboard and TuteeBooking.
// Renders a 7-col grid, coloured event dots, prev/next navigation,
// and an optional selected-date highlight.

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type DotColor = "green" | "blue" | "amber" | "purple" | "gray";

export interface CalendarDot {
  color: DotColor;
  label?: string;
}

export interface CalendarGridProps {
  /** Full year, e.g. 2026 */
  year: number;
  /** 0-indexed month, e.g. 2 for March */
  month: number;
  /** Map of "YYYY-MM-DD" → array of dots to show on that day */
  dots: Record<string, CalendarDot[]>;
  selectedDate?: string;
  /** Called when a non-disabled day is clicked */
  onDayClick: (date: string) => void;
  /** Called with +1 (next) or -1 (prev) to change month */
  onMonthChange: (dir: 1 | -1) => void;
  /** Dates strictly before this string are disabled. Defaults to today. */
  minDate?: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DOT_BG: Record<DotColor, string> = {
  green:  "bg-green-500",
  blue:   "bg-blue-500",
  amber:  "bg-amber-400",
  purple: "bg-purple-500",
  gray:   "bg-gray-400",
};

/** Zero-padded ISO date string from a Date object */
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Returns all Date cells for the 6-week grid containing the given month */
function buildCells(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);

  // Start on the Sunday on or before the 1st
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  // End on the Saturday on or after the last day
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));

  const cells: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    cells.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return cells;
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export function CalendarGrid({
  year, month, dots, selectedDate,
  onDayClick, onMonthChange, minDate,
}: CalendarGridProps) {
  const today   = toDateStr(new Date());
  const minimum = minDate ?? today;

  const cells = useMemo(() => buildCells(year, month), [year, month]);

  return (
    <div className="select-none w-full">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => onMonthChange(-1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        <span className="font-display text-base font-semibold text-gray-900">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => onMonthChange(1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1 tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden">
        {cells.map((date) => {
          const ds         = toDateStr(date);
          const inMonth    = date.getMonth() === month;
          const isToday    = ds === today;
          const isSel      = ds === selectedDate;
          const isDisabled = ds < minimum;
          const dayDots    = dots[ds] ?? [];

          return (
            <button
              key={ds}
              type="button"
              disabled={isDisabled}
              onClick={() => onDayClick(ds)}
              className={[
                "relative bg-white flex flex-col items-center justify-start pt-1.5 pb-1 gap-0.5",
                "min-h-[52px] transition-colors focus:outline-none focus:z-10",
                !inMonth   ? "opacity-25"                    : "",
                isDisabled ? "cursor-default opacity-40"    : "hover:bg-brand-50 cursor-pointer",
                isSel      ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : "",
              ].join(" ")}
            >
              {/* Date number */}
              <span className={[
                "w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium",
                isToday ? "bg-brand-500 text-white" : "text-gray-700",
              ].join(" ")}>
                {date.getDate()}
              </span>

              {/* Event dots */}
              {dayDots.length > 0 && (
                <div className="flex gap-[3px] flex-wrap justify-center px-1">
                  {dayDots.slice(0, 4).map((dot, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${DOT_BG[dot.color]} flex-shrink-0`}
                      title={dot.label}
                    />
                  ))}
                  {dayDots.length > 4 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
