import {
  format,
  getDaysInMonth,
  isSunday,
  isWithinInterval,
  parseISO,
  startOfDay,
} from "date-fns";
import { fr } from "date-fns/locale";

// ─── Sunday helpers ───────────────────────────────────────────────────────────

export { isSunday };

/** Returns true if the given date string (YYYY-MM-DD) is a Sunday. */
export function isDateSunday(dateStr: string): boolean {
  return isSunday(parseISO(dateStr));
}

// ─── Working-day helpers ──────────────────────────────────────────────────────

/** Returns all days of a given month/year as Date objects, excluding Sundays. */
export function getWorkingDaysOfMonth(year: number, month: number): Date[] {
  const count = getDaysInMonth(new Date(year, month - 1));
  const days: Date[] = [];
  for (let d = 1; d <= count; d++) {
    const date = new Date(year, month - 1, d);
    if (!isSunday(date)) days.push(date);
  }
  return days;
}

/** Format a Date to YYYY-MM-DD for comparisons. */
export function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Returns today's date at midnight (local time). */
export function today(): Date {
  return startOfDay(new Date());
}

/** Returns today as YYYY-MM-DD. */
export function todayStr(): string {
  return toIsoDate(today());
}

// ─── Leave helpers ────────────────────────────────────────────────────────────

export interface ApprovedLeave {
  startDate: string | Date;
  endDate: string | Date;
}

/** Check if a given date falls within any approved leave range. */
export function isOnLeave(date: Date, leaves: ApprovedLeave[]): boolean {
  return leaves.some((l) =>
    isWithinInterval(startOfDay(date), {
      start: startOfDay(
        typeof l.startDate === "string" ? parseISO(l.startDate) : l.startDate
      ),
      end: startOfDay(
        typeof l.endDate === "string" ? parseISO(l.endDate) : l.endDate
      ),
    })
  );
}

// ─── Score calculation ────────────────────────────────────────────────────────

export interface DayStats {
  date: string;
  totalPredefined: number;
  donePredefined: number;
  totalExtra: number;
  doneExtra: number;
  isLeave: boolean;
  isSundayDay: boolean;
}

export interface MonthStats {
  score20: number; // (done / total) * 20
  percentTotal: number; // done / total * 100
  percentPredefined: number;
  percentExtra: number;
  totalDone: number;
  totalTasks: number;
  leaveDays: number;
  workingDays: number;
}

// ─── Task frequency helpers ───────────────────────────────────────────────────

export type TaskFrequency = "DAILY" | "MONTHLY";

export interface FrequencyAwareAssignment {
  taskId: string;
  frequency: TaskFrequency;
}

export interface PredefinedLogLite {
  taskId: string | null;
  type: string;
  done: boolean;
}

export interface MonthlyTaskStatus {
  taskId: string;
  done: boolean;
}

/**
 * Splits assignments into DAILY (expected every working day, unchanged behavior) and
 * MONTHLY (expected once anywhere in the month — done as soon as one log in `monthLogs`
 * is checked, regardless of which day). `monthLogs` should cover the whole scoring period.
 */
export function splitAssignmentsByFrequency(
  assignments: FrequencyAwareAssignment[],
  monthLogs: PredefinedLogLite[]
): { dailyTaskIds: Set<string>; monthlyStatuses: MonthlyTaskStatus[] } {
  const dailyTaskIds = new Set(
    assignments.filter((a) => a.frequency !== "MONTHLY").map((a) => a.taskId)
  );
  const monthlyStatuses = assignments
    .filter((a) => a.frequency === "MONTHLY")
    .map((a) => ({
      taskId: a.taskId,
      done: monthLogs.some((l) => l.taskId === a.taskId && l.type === "PREDEFINED" && l.done),
    }));
  return { dailyTaskIds, monthlyStatuses };
}

export function calcMonthStats(
  days: DayStats[],
  monthlyTasks: MonthlyTaskStatus[] = []
): MonthStats {
  const activeDays = days.filter((d) => !d.isSundayDay && !d.isLeave);
  const workingDays = activeDays.length;
  const leaveDays = days.filter((d) => !d.isSundayDay && d.isLeave).length;

  const totalPredefinedDaily = activeDays.reduce(
    (s, d) => s + d.totalPredefined,
    0
  );
  const donePredefinedDaily = activeDays.reduce((s, d) => s + d.donePredefined, 0);
  const totalExtra = activeDays.reduce((s, d) => s + d.totalExtra, 0);
  const doneExtra = activeDays.reduce((s, d) => s + d.doneExtra, 0);

  // MONTHLY-frequency tasks count once for the whole month, not once per working day.
  const totalPredefined = totalPredefinedDaily + monthlyTasks.length;
  const donePredefined = donePredefinedDaily + monthlyTasks.filter((t) => t.done).length;

  const totalTasks = totalPredefined + totalExtra;
  const totalDone = donePredefined + doneExtra;

  const score20 = totalTasks > 0 ? (totalDone / totalTasks) * 20 : 0;
  const percentTotal = totalTasks > 0 ? (totalDone / totalTasks) * 100 : 0;
  const percentPredefined =
    totalPredefined > 0 ? (donePredefined / totalPredefined) * 100 : 0;
  const percentExtra =
    totalExtra > 0 ? (doneExtra / totalExtra) * 100 : 0;

  return {
    score20: Math.round(score20 * 100) / 100,
    percentTotal: Math.round(percentTotal * 100) / 100,
    percentPredefined: Math.round(percentPredefined * 100) / 100,
    percentExtra: Math.round(percentExtra * 100) / 100,
    totalDone,
    totalTasks,
    leaveDays,
    workingDays,
  };
}

// ─── Color coding ─────────────────────────────────────────────────────────────

export function getScoreColor(
  percent: number
): "red" | "yellow" | "green" | "gray" {
  if (percent < 50) return "red";
  if (percent <= 75) return "yellow";
  return "green";
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatMonthLabel(year: number, month: number): string {
  return format(new Date(year, month - 1), "MMMM yyyy", { locale: fr });
}

export function formatDayLabel(date: Date): string {
  return format(date, "EEE dd", { locale: fr });
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
