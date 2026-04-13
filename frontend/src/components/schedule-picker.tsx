"use client";

import { useState } from "react";
import { type Frequency, parseCron, buildCron } from "@/lib/cron";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i.toString().padStart(2, "0") + ":00",
}));

const HOUR_INTERVALS = [
  { value: "1", label: "Every hour" },
  { value: "2", label: "Every 2 hours" },
  { value: "3", label: "Every 3 hours" },
  { value: "4", label: "Every 4 hours" },
  { value: "6", label: "Every 6 hours" },
  { value: "8", label: "Every 8 hours" },
  { value: "12", label: "Every 12 hours" },
];

const MINUTES = [
  { value: "0", label: ":00" },
  { value: "15", label: ":15" },
  { value: "30", label: ":30" },
  { value: "45", label: ":45" },
];

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}${ordinalSuffix(i + 1)}`,
}));

function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

type SchedulePickerProps = {
  value: string;
  onChange: (cron: string) => void;
};

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  const parsed = value ? parseCron(value) : null;

  const [frequency, setFrequency] = useState<Frequency>(
    parsed?.frequency ?? (value ? "cron" : "manual"),
  );
  const [hour, setHour] = useState(parsed?.hour ?? "0");
  const [minute, setMinute] = useState(parsed?.minute ?? "0");
  const [dayOfWeek, setDayOfWeek] = useState(parsed?.dayOfWeek ?? "1");
  const [dayOfMonth, setDayOfMonth] = useState(parsed?.dayOfMonth ?? "1");
  const [hourInterval, setHourInterval] = useState(parsed?.hourInterval ?? "1");
  const [customCron, setCustomCron] = useState(frequency === "cron" ? value : "");

  // Helper: emit cron from current state with one value overridden
  function emit(overrides: Partial<{
    frequency: Frequency; hour: string; minute: string;
    dayOfWeek: string; dayOfMonth: string; hourInterval: string;
  }>) {
    const f = overrides.frequency ?? frequency;
    if (f === "manual") { onChange(""); return; }
    if (f === "cron") return; // cron mode emits from its own input
    const cron = buildCron(
      f,
      overrides.hour ?? hour,
      overrides.minute ?? minute,
      overrides.dayOfWeek ?? dayOfWeek,
      overrides.dayOfMonth ?? dayOfMonth,
      overrides.hourInterval ?? hourInterval,
    );
    onChange(cron);
  }

  function handleFrequencyChange(f: string) {
    const freq = f as Frequency;
    setFrequency(freq);
    if (freq === "manual") {
      onChange("");
    } else if (freq === "cron") {
      onChange(customCron);
    } else {
      emit({ frequency: freq });
    }
  }

  function handleHourChange(v: string) { setHour(v); emit({ hour: v }); }
  function handleMinuteChange(v: string) { setMinute(v); emit({ minute: v }); }
  function handleDayOfWeekChange(v: string) { setDayOfWeek(v); emit({ dayOfWeek: v }); }
  function handleDayOfMonthChange(v: string) { setDayOfMonth(v); emit({ dayOfMonth: v }); }
  function handleHourIntervalChange(v: string) { setHourInterval(v); emit({ hourInterval: v }); }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Schedule</Label>
        <Select value={frequency} onValueChange={handleFrequencyChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual (no schedule)</SelectItem>
            <SelectItem value="hourly">Hourly</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="cron">Advanced (cron expression)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {frequency === "hourly" && (
        <div className="flex items-center gap-3">
          <div className="space-y-1 flex-1">
            <Label className="text-xs text-muted-foreground">Interval</Label>
            <Select value={hourInterval} onValueChange={handleHourIntervalChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_INTERVALS.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">At minute</Label>
            <Select value={minute} onValueChange={handleMinuteChange}>
              <SelectTrigger className="w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MINUTES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {frequency === "daily" && (
        <div className="flex items-center gap-3">
          <div className="space-y-1 flex-1">
            <Label className="text-xs text-muted-foreground">Time</Label>
            <Select value={hour} onValueChange={handleHourChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {frequency === "weekly" && (
        <div className="flex items-center gap-3">
          <div className="space-y-1 flex-1">
            <Label className="text-xs text-muted-foreground">Day</Label>
            <Select value={dayOfWeek} onValueChange={handleDayOfWeekChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Time</Label>
            <Select value={hour} onValueChange={handleHourChange}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {frequency === "monthly" && (
        <div className="flex items-center gap-3">
          <div className="space-y-1 flex-1">
            <Label className="text-xs text-muted-foreground">Day of month</Label>
            <Select value={dayOfMonth} onValueChange={handleDayOfMonthChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_MONTH.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Time</Label>
            <Select value={hour} onValueChange={handleHourChange}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {frequency === "cron" && (
        <div className="space-y-1">
          <Input
            value={customCron}
            onChange={(e) => {
              setCustomCron(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="e.g. */15 * * * *"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Standard 5-field cron: minute hour day month weekday
          </p>
        </div>
      )}
    </div>
  );
}
