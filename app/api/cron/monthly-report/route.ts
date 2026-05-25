import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendMonthlyReportEmail, MonthlyReportRow } from "@/lib/email";
import { calcMonthStats, formatMonthLabel, getWorkingDaysOfMonth, isOnLeave, toIsoDate } from "@/lib/utils";
import { format } from "date-fns";

function renderTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => String(vars[key] ?? ""));
}

function previousMonthRef(now: Date) {
  if (now.getMonth() === 0) {
    return { month: 12, year: now.getFullYear() - 1 };
  }
  return { month: now.getMonth(), year: now.getFullYear() };
}

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

  const payload = await req.json().catch(() => ({} as Record<string, unknown>));
  const now = new Date();

  const monthParam = req.nextUrl.searchParams.get("month") ?? String(payload.month ?? "");
  const yearParam = req.nextUrl.searchParams.get("year") ?? String(payload.year ?? "");

  let month: number;
  let year: number;
  if (monthParam && yearParam) {
    month = Number(monthParam);
    year = Number(yearParam);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return Response.json({ error: "Mois/année invalides" }, { status: 400 });
    }
  } else {
    ({ month, year } = previousMonthRef(now));
  }

  const todayStr = format(now, "yyyy-MM-dd");
  const [todayYear, todayMonth, todayDay] = todayStr.split("-").map(Number);
  const todayDate = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay));
  const isCurrentMonth = month === todayMonth && year === todayYear;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = isCurrentMonth ? todayDate : new Date(Date.UTC(year, month, 0));
  const monthLabel = formatMonthLabel(year, month);

  const defaultEmailConfig = {
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
    emailConfig.monthlyRecipients.length > 0
      ? emailConfig.monthlyRecipients
      : emailConfig.recipients.length > 0
      ? emailConfig.recipients
      : fallbackAdminEmails;

  if (recipients.length === 0) {
    return Response.json({ ok: false, error: "No recipients found" }, { status: 400 });
  }

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const workingDays = getWorkingDaysOfMonth(year, month);
  const workingDaysInScope = isCurrentMonth
    ? workingDays.filter((d) => toIsoDate(d) <= todayStr)
    : workingDays;

  const rows: MonthlyReportRow[] = await Promise.all(
    employees.map(async (emp) => {
      const leaves = await prisma.leaveRequest.findMany({
        where: {
          userId: emp.id,
          status: "APPROVED",
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
      });

      const assignments = await prisma.taskAssignment.count({ where: { userId: emp.id } });

      const logs = await prisma.dailyTaskLog.findMany({
        where: {
          userId: emp.id,
          date: { gte: monthStart, lte: monthEnd },
        },
      });

      const dayStats = workingDaysInScope.map((day) => {
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
          isSundayDay: false,
        };
      });

      const stats = calcMonthStats(dayStats);

      return {
        name: emp.name,
        score20: stats.score20,
        percentTotal: stats.percentTotal,
        totalDone: stats.totalDone,
        totalTasks: stats.totalTasks,
        leaveDays: stats.leaveDays,
        workingDays: stats.workingDays,
      };
    })
  );

  try {
    const body = renderTemplate(emailConfig.monthlyReportBody, {
      monthLabel,
      usersCount: rows.length,
    });

    await sendMonthlyReportEmail({
      to: recipients,
      cc: emailConfig.cc,
      monthLabel,
      rows,
      body,
    });

    return Response.json({ ok: true, month, year, recipients: recipients.length });
  } catch (err) {
    console.error("Failed to send monthly report:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
