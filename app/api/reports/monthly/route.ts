import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getWorkingDaysOfMonth, isOnLeave, calcMonthStats, toIsoDate, formatMonthLabel } from "@/lib/utils";
import { isSunday } from "date-fns";

/**
 * GET /api/reports/monthly?month=5&year=2026
 * Returns monthly stats for all employees (admin) or current user (employee).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const month = sp.get("month") ? parseInt(sp.get("month")!) : now.getMonth() + 1;
  const year = sp.get("year") ? parseInt(sp.get("year")!) : now.getFullYear();

  const users = session.role === "ADMIN"
    ? await prisma.user.findMany({
        where: { role: "EMPLOYEE" },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [{ id: session.userId, name: session.name, email: session.email }];

  const workingDays = getWorkingDaysOfMonth(year, month);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const result = await Promise.all(
    users.map(async (user) => {
      // Approved leaves for this month
      const leaves = await prisma.leaveRequest.findMany({
        where: {
          userId: user.id,
          status: "APPROVED",
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
      });

      // Assignments
      const assignments = await prisma.taskAssignment.count({ where: { userId: user.id } });

      // All logs for the month
      const logs = await prisma.dailyTaskLog.findMany({
        where: {
          userId: user.id,
          date: { gte: monthStart, lte: monthEnd },
        },
      });

      const dayStats = workingDays.map((day) => {
        const dayStr = toIsoDate(day);
        const isLeaveDay = isOnLeave(day, leaves.map((l) => ({ startDate: l.startDate, endDate: l.endDate })));
        const dayLogs = logs.filter((l) => toIsoDate(new Date(l.date)) === dayStr);

        const donePredefined = dayLogs.filter((l) => l.type === "PREDEFINED" && l.done).length;
        const extraLogs = dayLogs.filter((l) => l.type === "EXTRA");
        const doneExtra = extraLogs.filter((l) => l.done).length;

        return {
          date: dayStr,
          totalPredefined: assignments,
          donePredefined,
          totalExtra: extraLogs.length,
          doneExtra,
          isLeave: isLeaveDay,
          isSundayDay: isSunday(day),
        };
      });

      const stats = calcMonthStats(dayStats);

      return {
        userId: user.id,
        name: user.name,
        month,
        year,
        monthLabel: formatMonthLabel(year, month),
        ...stats,
        dayStats,
      };
    })
  );

  return Response.json({ month, year, monthLabel: formatMonthLabel(year, month), rows: result });
}
