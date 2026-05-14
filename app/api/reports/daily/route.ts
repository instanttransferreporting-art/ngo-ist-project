import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isSunday, parseISO, isWithinInterval, startOfDay } from "date-fns";
import { format } from "date-fns";

/**
 * GET /api/reports/daily?date=YYYY-MM-DD
 * Returns stats for all employees (admin) or current user (employee) for a given day.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const dateStr = req.nextUrl.searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");
  const date = parseISO(dateStr);

  if (isSunday(date)) {
    return Response.json({ error: "Pas de rapport le dimanche" }, { status: 400 });
  }

  const users = session.role === "ADMIN"
    ? await prisma.user.findMany({
        where: { role: "EMPLOYEE" },
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

      // Assignments count as total predefined
      const assignments = await prisma.taskAssignment.count({ where: { userId: user.id } });

      // Done predefined logs for this day
      const donePredefinedLogs = await prisma.dailyTaskLog.count({
        where: { userId: user.id, date, type: "PREDEFINED", done: true },
      });

      // Extra tasks for this day
      const extraLogs = await prisma.dailyTaskLog.findMany({
        where: { userId: user.id, date, type: "EXTRA" },
      });
      const doneExtra = extraLogs.filter((l) => l.done).length;
      const totalExtra = extraLogs.length;

      const totalPredefined = assignments;
      const donePredefined = donePredefinedLogs;
      const total = totalPredefined + totalExtra;
      const done = donePredefined + doneExtra;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;

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
        status: "Présent",
      };
    })
  );

  return Response.json({ date: dateStr, rows: result });
}
