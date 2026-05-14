import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDailyReportEmail, DailyReportRow } from "@/lib/email";
import { isSunday, format } from "date-fns";

/**
 * POST /api/cron/daily-report
 * Triggered daily at 22:00 by Vercel Cron.
 * Sends a summary report to all admins.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  if (isSunday(today)) {
    return Response.json({ skipped: "Sunday" });
  }

  const todayDate = new Date(format(today, "yyyy-MM-dd"));
  const dateStr = format(today, "dd/MM/yyyy");

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const adminEmails = admins.map((a) => a.email);

  if (adminEmails.length === 0) {
    return Response.json({ ok: false, error: "No admin emails found" });
  }

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { name: "asc" },
  });

  const rows: DailyReportRow[] = await Promise.all(
    employees.map(async (emp) => {
      const onLeave = await prisma.leaveRequest.count({
        where: {
          userId: emp.id,
          status: "APPROVED",
          startDate: { lte: todayDate },
          endDate: { gte: todayDate },
        },
      });

      if (onLeave > 0) {
        return { name: emp.name, done: 0, total: 0, percent: 0, status: "En congé" as const };
      }

      const total = await prisma.taskAssignment.count({ where: { userId: emp.id } });
      const done = await prisma.dailyTaskLog.count({
        where: { userId: emp.id, date: todayDate, type: "PREDEFINED", done: true },
      });
      const extraDone = await prisma.dailyTaskLog.count({
        where: { userId: emp.id, date: todayDate, type: "EXTRA", done: true },
      });
      const extraTotal = await prisma.dailyTaskLog.count({
        where: { userId: emp.id, date: todayDate, type: "EXTRA" },
      });

      const totalAll = total + extraTotal;
      const doneAll = done + extraDone;
      const percent = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;

      return {
        name: emp.name,
        done: doneAll,
        total: totalAll,
        percent,
        status: "Présent" as const,
      };
    })
  );

  try {
    await sendDailyReportEmail({ to: adminEmails, date: dateStr, rows });
    return Response.json({ ok: true, date: dateStr, recipients: adminEmails.length });
  } catch (err) {
    console.error("Failed to send daily report:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
