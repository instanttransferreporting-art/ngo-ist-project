import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDailyReportEmail, DailyReportRow } from "@/lib/email";
import { getSession } from "@/lib/auth";
import { isSunday, format } from "date-fns";
import { buildDailyExcel } from "@/lib/excel";
import { calcMonthStats, getWorkingDaysOfMonth, isOnLeave, toIsoDate } from "@/lib/utils";

function renderTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => String(vars[key] ?? ""));
}

/**
 * POST /api/cron/daily-report
 * Triggered daily at 22:00 by Vercel Cron.
 * Sends a summary report to all admins.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const isCronCall = auth === `Bearer ${process.env.CRON_SECRET}`;
  const origin = req.headers.get("origin") ?? "";
  const isLocalDevCall =
    process.env.NODE_ENV !== "production" &&
    (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));
  if (!isCronCall) {
    const session = await getSession();
    if ((!session || session.role !== "ADMIN") && !isLocalDevCall) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  if (isSunday(now)) {
    return Response.json({ skipped: "Sunday" });
  }

  const todayIso = format(now, "yyyy-MM-dd");
  const [year, month, day] = todayIso.split("-").map(Number);
  const todayDate = new Date(Date.UTC(year, month - 1, day));
  const dateStr = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const workingDaysToDate = getWorkingDaysOfMonth(year, month).filter((d) => toIsoDate(d) <= todayIso);

  const defaultEmailConfig: {
    id: string;
    recipients: string[];
    reminderRecipients: string[];
    dailyRecipients: string[];
    monthlyRecipients: string[];
    cc: string[];
    reminderBody: string;
    reportBody: string;
    monthlyReportBody: string;
  } = {
    id: "global",
    recipients: [],
    reminderRecipients: [],
    dailyRecipients: [],
    monthlyRecipients: [],
    cc: [],
    reminderBody: "Bonjour {name}, il vous reste {pendingCount} tache(s) a completer pour {date}.",
    reportBody: "Rapport journalier du {date}.",
    monthlyReportBody: "Rapport mensuel de {monthLabel}.",
  };

  let emailConfig = defaultEmailConfig;
  try {
    emailConfig = await prisma.emailConfig.upsert({
      where: { id: "global" },
      update: {},
      create: defaultEmailConfig,
    });
  } catch {
    // Keep default values when DB schema is behind code.
  }

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const fallbackAdminEmails = admins.map((a) => a.email);
  const recipients =
    emailConfig.dailyRecipients.length > 0
      ? emailConfig.dailyRecipients
      : emailConfig.recipients.length > 0
      ? emailConfig.recipients
      : fallbackAdminEmails;

  if (recipients.length === 0) {
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
        return { name: emp.name, done: 0, total: 0, percent: 0, monthScore20: 0, status: "En congé" as const };
      }

      const total = await prisma.taskAssignment.count({ where: { userId: emp.id } });
      const leaves = await prisma.leaveRequest.findMany({
        where: {
          userId: emp.id,
          status: "APPROVED",
          startDate: { lte: todayDate },
          endDate: { gte: monthStart },
        },
      });
      const monthLogs = await prisma.dailyTaskLog.findMany({
        where: { userId: emp.id, date: { gte: monthStart, lte: todayDate } },
      });

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

      const dayStats = workingDaysToDate.map((day) => {
        const ds = toIsoDate(day);
        const dayLogs = monthLogs.filter((l) => toIsoDate(new Date(l.date)) === ds);
        const dayExtra = dayLogs.filter((l) => l.type === "EXTRA");
        return {
          date: ds,
          totalPredefined: total,
          donePredefined: dayLogs.filter((l) => l.type === "PREDEFINED" && l.done).length,
          totalExtra: dayExtra.length,
          doneExtra: dayExtra.filter((l) => l.done).length,
          isLeave: isOnLeave(day, leaves.map((l) => ({ startDate: l.startDate, endDate: l.endDate }))),
          isSundayDay: false,
        };
      });
      const monthStats = calcMonthStats(dayStats);

      return {
        name: emp.name,
        done: doneAll,
        total: totalAll,
        percent,
        monthScore20: monthStats.score20,
        status: "Présent" as const,
      };
    })
  );

  const excelBuffer = buildDailyExcel(
    rows.map((r) => ({
      employé: r.name,
      date: dateStr,
      tachesFaites: r.done,
      tachesTotal: r.total,
      pourcentage: r.percent,
      statut: r.status,
    }))
  );

  try {
    const avgPercent = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.percent, 0) / rows.length) : 0;
    const body = renderTemplate(emailConfig.reportBody, {
      date: dateStr,
      usersCount: rows.length,
      avgPercent,
    });
    await sendDailyReportEmail({
      to: recipients,
      cc: emailConfig.cc,
      date: dateStr,
      rows,
      body,
      attachments: [
        {
          filename: `rapport-journalier-${todayIso}.xlsx`,
          content: excelBuffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });
    return Response.json({ ok: true, date: dateStr, recipients: recipients.length });
  } catch (err) {
    console.error("Failed to send daily report:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
