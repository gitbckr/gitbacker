/**
 * Cron expression helpers. All stored cron expressions use UTC hours;
 * these helpers convert between local display hours and UTC.
 *
 * getTimezoneOffset() returns minutes: UTC+4 → -240, UTC-5 → 300.
 * Computed inline (not module-level) so it always reflects the client clock.
 */

export type Frequency = "manual" | "hourly" | "daily" | "weekly" | "monthly" | "cron";

export function localHourToUtc(localHour: number): number {
  const offset = new Date().getTimezoneOffset();
  return ((localHour + offset / 60) % 24 + 24) % 24;
}

export function utcHourToLocal(utcHour: number): number {
  const offset = new Date().getTimezoneOffset();
  return ((utcHour - offset / 60) % 24 + 24) % 24;
}

export function parseCron(cron: string): {
  frequency: Frequency;
  hour: string;
  minute: string;
  dayOfWeek: string;
  dayOfMonth: string;
  hourInterval: string;
} | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hr, dom, , dow] = parts;

  const localHr = hr !== "*" && !hr.startsWith("*/")
    ? String(utcHourToLocal(Number(hr)))
    : hr;

  if (dom !== "*" && dow === "*" && hr !== "*") {
    return { frequency: "monthly", minute: min, hour: localHr, dayOfMonth: dom, dayOfWeek: "0", hourInterval: "1" };
  }
  if (dow !== "*" && dom === "*" && hr !== "*") {
    return { frequency: "weekly", minute: min, hour: localHr, dayOfWeek: dow, dayOfMonth: "1", hourInterval: "1" };
  }
  if (hr !== "*" && !hr.startsWith("*/") && dom === "*" && dow === "*") {
    return { frequency: "daily", minute: min, hour: localHr, dayOfWeek: "0", dayOfMonth: "1", hourInterval: "1" };
  }
  if (dom === "*" && dow === "*") {
    const intervalMatch = hr.match(/^\*\/(\d+)$/);
    if (hr === "*") {
      return { frequency: "hourly", minute: min, hour: "0", dayOfWeek: "0", dayOfMonth: "1", hourInterval: "1" };
    }
    if (intervalMatch) {
      return { frequency: "hourly", minute: min, hour: "0", dayOfWeek: "0", dayOfMonth: "1", hourInterval: intervalMatch[1] };
    }
  }

  return null;
}

export function buildCron(
  frequency: Frequency,
  hour: string,
  minute: string,
  dayOfWeek: string,
  dayOfMonth: string,
  hourInterval: string,
): string {
  const utcHr = String(localHourToUtc(Number(hour)));
  switch (frequency) {
    case "hourly":
      return hourInterval === "1"
        ? `${minute} * * * *`
        : `${minute} */${hourInterval} * * *`;
    case "daily":
      return `${minute} ${utcHr} * * *`;
    case "weekly":
      return `${minute} ${utcHr} * * ${dayOfWeek}`;
    case "monthly":
      return `${minute} ${utcHr} ${dayOfMonth} * *`;
    default:
      return "";
  }
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function formatCron(cron: string | null): string {
  if (!cron) return "Manual";
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hr, dom, , dow] = parts;

  const localHr = hr !== "*" && !hr.startsWith("*/")
    ? String(utcHourToLocal(Number(hr)))
    : hr;

  const fmtTime = (h: string) =>
    `${h.padStart(2, "0")}:${min.padStart(2, "0")}`;

  if (dom !== "*" && dow === "*" && hr !== "*") {
    return `Monthly on ${dom}${ordinal(Number(dom))} at ${fmtTime(localHr)}`;
  }
  if (dow !== "*" && dom === "*" && hr !== "*") {
    return `${DAYS[Number(dow)] ?? dow}s at ${fmtTime(localHr)}`;
  }
  if (hr !== "*" && dom === "*" && dow === "*") {
    return `Daily at ${fmtTime(localHr)}`;
  }
  if (dom === "*" && dow === "*") {
    const intervalMatch = hr.match(/^\*\/(\d+)$/);
    if (hr === "*") return "Every hour";
    if (intervalMatch) return `Every ${intervalMatch[1]}h`;
  }

  return cron;
}
