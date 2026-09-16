import { prisma } from "@/lib/prisma";
import { toIsoDate, isOnLeave, formatDayLabel } from "@/lib/utils";

/** Builds the "Groupe / Tâche / Délai / <days> / % Fait" table for one employee's month. */
export async function getEmployeeSheetData(
  userId: string,
  monthStart: Date,
  monthEnd: Date,
  workingDays: Date[]
): Promise<{ headers: string[]; rows: (string | number)[][] }> {
  const [assignments, logs, leaves] = await Promise.all([
    prisma.taskAssignment.findMany({
      where: { userId },
      include: { task: true },
      orderBy: [{ task: { group: "asc" } }, { order: "asc" }],
    }),
    prisma.dailyTaskLog.findMany({
      where: { userId, date: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.leaveRequest.findMany({
      where: { userId, status: "APPROVED", startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
    }),
  ]);

  const dayHeaders = workingDays.map((d) => formatDayLabel(d));
  const headers = ["Groupe", "Tâche", "Délai", ...dayHeaders, "% Fait"];

  const groups: Record<string, typeof assignments> = {};
  for (const a of assignments) {
    const g = a.task.group;
    if (!groups[g]) groups[g] = [];
    groups[g].push(a);
  }

  const rows: (string | number)[][] = [];

  for (const [group, tasks] of Object.entries(groups)) {
    for (const a of tasks) {
      const dayCells: (string | number)[] = workingDays.map((day) => {
        const dayStr = toIsoDate(day);
        if (isOnLeave(day, leaves.map((l) => ({ startDate: l.startDate, endDate: l.endDate })))) {
          return "Congé";
        }
        const log = logs.find(
          (l) => l.taskId === a.taskId && toIsoDate(new Date(l.date)) === dayStr
        );
        return log?.done ? "✓" : "";
      });

      const doneCount = dayCells.filter((c) => c === "✓").length;
      const totalDays = dayCells.filter((c) => c !== "Congé").length;
      const percent = totalDays > 0 ? Math.round((doneCount / totalDays) * 100) : 0;

      rows.push([group, a.task.title, a.task.deadline ?? "", ...dayCells, `${percent}%`]);
    }
  }

  const extraLogs = logs.filter((l) => l.type === "EXTRA");
  if (extraLogs.length > 0) {
    const extraByDay: Record<string, string[]> = {};
    for (const l of extraLogs) {
      const ds = toIsoDate(new Date(l.date));
      if (!extraByDay[ds]) extraByDay[ds] = [];
      extraByDay[ds].push(l.extraLabel ?? "Tâche extra");
    }
    const extraRow: (string | number)[] = ["Extra", "Tâches supplémentaires", ""];
    for (const day of workingDays) {
      const ds = toIsoDate(day);
      const extras = extraByDay[ds] ?? [];
      extraRow.push(extras.length > 0 ? extras.join(", ") : "");
    }
    extraRow.push("");
    rows.push(extraRow);
  }

  return { headers, rows };
}
