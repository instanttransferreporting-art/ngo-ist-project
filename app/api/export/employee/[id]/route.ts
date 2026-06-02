import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildEmployeeExcel } from "@/lib/excel";
import { getWorkingDaysOfMonth, isOnLeave, toIsoDate, formatMonthLabel, formatDayLabel } from "@/lib/utils";
import { isSunday } from "date-fns";

type Params = { params: Promise<{ id: string }> };

/** GET /api/export/employee/[id]?month=5&year=2026 */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession();
  const { id: userId } = await params;

  // Admins can export anyone; employees can only export themselves
  if (!session || (session.role !== "ADMIN" && session.userId !== userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const month = sp.get("month") ? parseInt(sp.get("month")!) : now.getMonth() + 1;
  const year = sp.get("year") ? parseInt(sp.get("year")!) : now.getFullYear();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return Response.json({ error: "Utilisateur introuvable" }, { status: 404 });

  const workingDays = getWorkingDaysOfMonth(year, month);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

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

  // Group tasks
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

  // Extra tasks row placeholder
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

  const buffer = buildEmployeeExcel({
    name: user.name,
    month: formatMonthLabel(year, month),
    headers,
    rows,
  });

  const filename = `${user.name.replace(/\s/g, "_")}-${formatMonthLabel(year, month).replace(/\s/g, "_")}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
