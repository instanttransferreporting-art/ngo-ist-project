import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { format } from "date-fns";
import { calcMonthStats, getWorkingDaysOfMonth, isOnLeave, toIsoDate, splitAssignmentsByFrequency } from "@/lib/utils";

/**
 * GET /api/reports/daily?date=YYYY-MM-DD
 * Returns stats for all employees (admin) or current user (employee) for a given day.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const dateStr = req.nextUrl.searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return Response.json({ error: "Date invalide" }, { status: 400 });
  }
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCDay() === 0) {
    return Response.json({ error: "Pas de rapport le dimanche" }, { status: 400 });
  }

  const users = session.role === "ADMIN"
    ? await prisma.user.findMany({
        where: { role: "EMPLOYEE", isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [{ id: session.userId, name: session.name, email: session.email }];

  const result = await Promise.all(
    users.map(async (user) => {
      // Check approved leave
      const leaves = await prisma.leaveRequest.findMany({
        where: {
          userId: user.id,
          status: "APPROVED",
          startDate: { lte: date },
          endDate: { gte: date },
        },
      });
      const isLeave = leaves.length > 0;

      if (isLeave) {
        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          isLeave: true,
          done: 0,
          total: 0,
          percent: 0,
          donePredefined: 0,
          totalPredefined: 0,
          doneExtra: 0,
          totalExtra: 0,
          status: "En congé",
        };
      }

      // Assignments (with frequency) count toward total predefined
      const assignments = await prisma.taskAssignment.findMany({
        where: { userId: user.id },
        select: { taskId: true, task: { select: { frequency: true } } },
      });

      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const workingDaysToDate = getWorkingDaysOfMonth(year, month).filter((d) => toIsoDate(d) <= dateStr);
      const monthLogs = await prisma.dailyTaskLog.findMany({
        where: { userId: user.id, date: { gte: monthStart, lte: date } },
      });
      const monthLeaves = await prisma.leaveRequest.findMany({
        where: {
          userId: user.id,
          status: "APPROVED",
          startDate: { lte: date },
          endDate: { gte: monthStart },
        },
      });

      const { dailyTaskIds, monthlyStatuses } = splitAssignmentsByFrequency(
        assignments.map((a) => ({ taskId: a.taskId, frequency: a.task.frequency })),
        monthLogs
      );

      // Done predefined (DAILY) logs for this day
      const donePredefinedLogsToday = await prisma.dailyTaskLog.count({
        where: { userId: user.id, date, type: "PREDEFINED", done: true, taskId: { in: [...dailyTaskIds] } },
      });

      // Extra tasks for this day
      const extraLogs = await prisma.dailyTaskLog.findMany({
        where: { userId: user.id, date, type: "EXTRA" },
      });
      const doneExtra = extraLogs.filter((l) => l.done).length;
      const totalExtra = extraLogs.length;

      // MONTHLY tasks count toward "today" until they're done for the month, then they stop
      // showing up as pending at all — done contributes on the day they're actually checked.
      const totalPredefined = dailyTaskIds.size + monthlyStatuses.length;
      const donePredefined =
        donePredefinedLogsToday + monthlyStatuses.filter((t) => t.done).length;
      const total = totalPredefined + totalExtra;
      const done = donePredefined + doneExtra;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;

      const dayStats = workingDaysToDate.map((day) => {
        const ds = toIsoDate(day);
        const dayLogs = monthLogs.filter((l) => toIsoDate(new Date(l.date)) === ds);
        const dayExtra = dayLogs.filter((l) => l.type === "EXTRA");
        return {
          date: ds,
          totalPredefined: dailyTaskIds.size,
          donePredefined: dayLogs.filter((l) => l.type === "PREDEFINED" && l.done && l.taskId && dailyTaskIds.has(l.taskId)).length,
          totalExtra: dayExtra.length,
          doneExtra: dayExtra.filter((l) => l.done).length,
          isLeave: isOnLeave(day, monthLeaves.map((l) => ({ startDate: l.startDate, endDate: l.endDate }))),
          isSundayDay: false,
        };
      });
      const monthStats = calcMonthStats(dayStats, monthlyStatuses);

      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        isLeave: false,
        done,
        total,
        percent,
        donePredefined,
        totalPredefined,
        doneExtra,
        totalExtra,
        monthScore20: monthStats.score20,
        monthPercent: monthStats.percentTotal,
        status: "Présent",
      };
    })
  );

  return Response.json({ date: dateStr, rows: result });
}
