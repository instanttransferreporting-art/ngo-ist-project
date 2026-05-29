import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getWorkingDaysOfMonth, isOnLeave, toIsoDate, calcMonthStats } from "@/lib/utils";
import { format } from "date-fns";

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

  const targetMonthDate = new Date(year, month - 1, 1);

  let userRecord: { id: string; createdAt: Date; templatePreference?: "A" | "B" | null } | null = null;
  try {
    userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true, templatePreference: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const knownCode = typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: string }).code)
      : "";

    if (knownCode === "P2022" || message.includes("templatePreference") || message.includes("Unknown field")) {
      const fallback = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, createdAt: true },
      });
      userRecord = fallback ? { ...fallback, templatePreference: null } : null;
    } else {
      throw err;
    }
  }

  if (!userRecord) {
    return Response.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const minDate = new Date(userRecord.createdAt.getFullYear(), userRecord.createdAt.getMonth(), 1);
  // Admins can view up to one month ahead for future planning
  const isAdminViewer = session.role === "ADMIN";
  const maxDate = isAdminViewer
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);

  if (targetMonthDate < minDate || targetMonthDate > maxDate) {
    return Response.json(
      {
        error: "Mois hors plage autorisée",
        minYear: minDate.getFullYear(),
        minMonth: minDate.getMonth() + 1,
        maxYear: maxDate.getFullYear(),
        maxMonth: maxDate.getMonth() + 1,
      },
      { status: 400 }
    );
  }

  // Use local date string for "today" (correct calendar date for the user's timezone),
  // then create a UTC midnight Date for consistent DB comparisons with @db.Date fields.
  const todayDateStr = format(now, "yyyy-MM-dd"); // local YYYY-MM-DD
  const today = new Date(todayDateStr + "T00:00:00.000Z"); // UTC midnight
  const isCurrentMonth = today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month;
  const isFutureMonth = targetMonthDate > new Date(now.getFullYear(), now.getMonth(), 1);
  // UTC midnight boundaries for correct @db.Date range queries
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = isCurrentMonth && !isAdminViewer ? today : new Date(Date.UTC(year, month, 0));

  // Only create MonthlySheet record for current/past months (not future planning views)
  if (!isFutureMonth) {
    await prisma.monthlySheet.upsert({
      where: { userId_month_year: { userId, month, year } },
      create: { userId, month, year },
      update: {},
    });
  }

  // Determine which assignments to show:
  // - Future month: check for a plan; use plan tasks if useCurrentTasks=false
  // - Current/past: use standard TaskAssignment
  let assignments: Array<{ taskId: string; executors: string; task: { group: string; title: string; deadline: string | null } }>;

  if (isFutureMonth && isAdminViewer) {
    const plan = await prisma.monthlyAssignmentPlan.findUnique({
      where: { userId_month_year: { userId, month, year } },
      include: {
        tasks: {
          include: { task: true },
          orderBy: [{ task: { group: "asc" } }, { order: "asc" }],
        },
      },
    });

    if (plan && !plan.useCurrentTasks) {
      // Fetch executors from TaskAssignment for each plan task
      const taskAssignmentData = await prisma.taskAssignment.findMany({
        where: { userId },
        select: { taskId: true, executors: true },
      });
      const execMap = new Map(taskAssignmentData.map((a) => [a.taskId, a.executors]));
      assignments = plan.tasks.map((pt) => ({ taskId: pt.taskId, executors: execMap.get(pt.taskId) ?? "", task: pt.task }));
    } else {
      // useCurrentTasks=true or no plan → use current TaskAssignment
      assignments = await prisma.taskAssignment.findMany({
        where: { userId },
        include: { task: true },
        orderBy: [{ task: { group: "asc" } }, { order: "asc" }],
      });
    }
  } else {
    assignments = await prisma.taskAssignment.findMany({
      where: { userId },
      include: { task: true },
      orderBy: [{ task: { group: "asc" } }, { order: "asc" }],
    });
  }

  const [logs, leaves, lockConfig] = await Promise.all([
    isFutureMonth
      ? Promise.resolve([])
      : prisma.dailyTaskLog.findMany({
          where: { userId, date: { gte: monthStart, lte: monthEnd } },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        }),
    isFutureMonth
      ? Promise.resolve([])
      : prisma.leaveRequest.findMany({
          where: {
            userId,
            status: "APPROVED",
            startDate: { lte: monthEnd },
            endDate: { gte: monthStart },
          },
        }),
    prisma.dayLockConfig.findUnique({ where: { id: "global" } }),
  ]);

  const workingDays = getWorkingDaysOfMonth(year, month).filter(
    (d) => isAdminViewer || !isCurrentMonth || toIsoDate(d) <= todayDateStr
  );
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

  // Stats use only elapsed working days (up to today) for the current month;
  // for past months use all days. For future months, return zero stats.
  const statsDaySet = new Set(
    isFutureMonth
      ? []
      : (isCurrentMonth ? workingDays.filter((d) => toIsoDate(d) <= todayDateStr) : workingDays).map((d) => toIsoDate(d))
  );
  const dayStats = days
    .filter((d) => statsDaySet.has(d.date))
    .map((d) => ({
      date: d.date,
      totalPredefined: assignments.length,
      donePredefined: d.predefinedLogs.filter((l) => l.done).length,
      totalExtra: d.extraLogs.length,
      doneExtra: d.extraLogs.filter((l) => l.done).length,
      isLeave: d.isLeave,
      isSundayDay: false,
    }));
  const stats = calcMonthStats(dayStats);

  return Response.json({
    userId,
    month,
    year,
    isFuturePlan: isFutureMonth && isAdminViewer,
    minYear: minDate.getFullYear(),
    minMonth: minDate.getMonth() + 1,
    maxYear: maxDate.getFullYear(),
    maxMonth: maxDate.getMonth() + 1,
    lockMode: lockConfig?.mode ?? "FREE",
    globalTemplate: lockConfig?.template ?? "A",
    userTemplate: userRecord.templatePreference,
    template: userRecord.templatePreference ?? lockConfig?.template ?? "A",
    assignments: assignments.map((a) => ({
      taskId: a.taskId,
      group: a.task.group,
      title: a.task.title,
      deadline: a.task.deadline,
      executors: a.executors,
    })),
    days,
    stats,
  });
}
