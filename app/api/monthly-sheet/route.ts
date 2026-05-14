import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getWorkingDaysOfMonth, isOnLeave, toIsoDate, calcMonthStats } from "@/lib/utils";
import { isSunday } from "date-fns";

/**
 * GET /api/monthly-sheet?userId=xxx&month=5&year=2026
 * Returns the full monthly sheet data: tasks + logs + leave info for each day.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId") ?? session.userId;
  const now = new Date();
  const month = sp.get("month") ? parseInt(sp.get("month")!) : now.getMonth() + 1;
  const year = sp.get("year") ? parseInt(sp.get("year")!) : now.getFullYear();

  if (session.role !== "ADMIN" && session.userId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  // Ensure monthly sheet record exists
  await prisma.monthlySheet.upsert({
    where: { userId_month_year: { userId, month, year } },
    create: { userId, month, year },
    update: {},
  });

  const [assignments, logs, leaves, lockConfig] = await Promise.all([
    prisma.taskAssignment.findMany({
      where: { userId },
      include: { task: true },
      orderBy: [{ task: { group: "asc" } }, { order: "asc" }],
    }),
    prisma.dailyTaskLog.findMany({
      where: { userId, date: { gte: monthStart, lte: monthEnd } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId,
        status: "APPROVED",
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
    }),
    prisma.dayLockConfig.findUnique({ where: { id: "global" } }),
  ]);

  const workingDays = getWorkingDaysOfMonth(year, month);
  const approvedLeaves = leaves.map((l) => ({ startDate: l.startDate, endDate: l.endDate }));

  const days = workingDays.map((day) => {
    const dayStr = toIsoDate(day);
    const isLeaveDay = isOnLeave(day, approvedLeaves);
    const dayLogs = logs.filter((l) => toIsoDate(new Date(l.date)) === dayStr);

    const predefinedLogs = assignments.map((a) => {
      const log = dayLogs.find((l) => l.taskId === a.taskId && l.type === "PREDEFINED");
      return {
        taskId: a.taskId,
        logId: log?.id ?? null,
        done: log?.done ?? false,
        group: a.task.group,
        title: a.task.title,
        deadline: a.task.deadline,
      };
    });

    const extraLogs = dayLogs
      .filter((l) => l.type === "EXTRA")
      .map((l) => ({
        logId: l.id,
        extraLabel: l.extraLabel,
        done: l.done,
      }));

    return {
      date: dayStr,
      isLeave: isLeaveDay,
      predefinedLogs,
      extraLogs,
    };
  });

  // Compute stats for display
  const dayStats = days.map((d) => ({
    date: d.date,
    totalPredefined: assignments.length,
    donePredefined: d.predefinedLogs.filter((l) => l.done).length,
    totalExtra: d.extraLogs.length,
    doneExtra: d.extraLogs.filter((l) => l.done).length,
    isLeave: d.isLeave,
    isSundayDay: false, // already filtered
  }));
  const stats = calcMonthStats(dayStats);

  return Response.json({
    userId,
    month,
    year,
    lockMode: lockConfig?.mode ?? "FREE",
    assignments: assignments.map((a) => ({
      taskId: a.taskId,
      group: a.task.group,
      title: a.task.title,
      deadline: a.task.deadline,
    })),
    days,
    stats,
  });
}
