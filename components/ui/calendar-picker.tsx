"use client";
// components/ui/calendar-picker.tsx
// Calendar date picker — days without data are faded and disabled.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarPickerProps {
  activeDates: string[];   // array of "YYYY-MM-DD" strings that have data
  selected: string;        // currently selected "YYYY-MM-DD"
  onSelect: (date: string) => void;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export function CalendarPicker({ activeDates, selected, onSelect }: CalendarPickerProps) {
  const activeSet = new Set(activeDates);

  // Start on the month of most recent active date or today
  const initialDate = activeDates[0]
    ? new Date(activeDates[0] + "T00:00:00")
    : new Date();

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()); // 0-indexed

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Pad start
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad end to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  function dateStr(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const today = new Date().toISOString().split("T")[0];

  // Check if this month has any active dates
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthHasData = activeDates.some((d) => d.startsWith(monthPrefix));

  return (
    <div className="rounded-lg border bg-card p-3 w-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {MONTHS[viewMonth]} {viewYear}
          {!monthHasData && (
            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(no data)</span>
          )}
        </span>
        <button onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/60 transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;

          const ds = dateStr(day);
          const isActive = activeSet.has(ds);
          const isSelected = ds === selected;
          const isToday = ds === today;

          return (
            <button
              key={ds}
              type="button"
              disabled={!isActive}
              onClick={() => isActive && onSelect(ds)}
              className={cn(
                "relative flex h-8 w-full items-center justify-center rounded-md text-xs transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : isActive
                  ? "hover:bg-accent font-medium text-foreground cursor-pointer"
                  : "text-muted-foreground/30 cursor-not-allowed",
                isToday && !isSelected && "ring-1 ring-primary/40",
              )}
            >
              {day}
              {/* Dot indicator for active dates */}
              {isActive && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary/60" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 border-t pt-2.5">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-[10px] text-primary-foreground font-semibold">1</span>
          <span className="text-[10px] text-muted-foreground">Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-5 w-5 items-center justify-center rounded-md border text-[10px] font-medium">
            2
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary/60" />
          </span>
          <span className="text-[10px] text-muted-foreground">Has data</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] text-muted-foreground/30">3</span>
          <span className="text-[10px] text-muted-foreground">No data</span>
        </div>
      </div>
    </div>
  );
}