import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReminderEmail } from "@/lib/email";
import { getSession } from "@/lib/auth";
import { isSunday, format } from "date-fns";

function renderTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => String(vars[key] ?? ""));
}

/**
 * POST /api/cron/reminder
 * Triggered daily at 18:00 by Vercel Cron.
 * Sends a reminder email to every employee who hasn't completed all tasks today.
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

  const today = new Date();
  if (isSunday(today)) {
    return Response.json({ skipped: "Sunday" });
  }

  const todayDate = new Date(format(today, "yyyy-MM-dd"));
  const dateStr = format(today, "dd/MM/yyyy");

  const emailConfig = await prisma.emailConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      recipients: [],
      cc: [],
      reminderBody: "Bonjour {name}, il vous reste {pendingCount} tache(s) a completer pour {date}.",
      reportBody: "Rapport journalier du {date}.",
      monthlyReportBody: "Rapport mensuel de {monthLabel}.",
    },
  });

  const employees = await prisma.user.findMany({ where: { role: "EMPLOYEE" } });
  let sent = 0;
  let skipped = 0;

  for (const emp of employees) {
    // Check if on approved leave today
    const onLeave = await prisma.leaveRequest.count({
      where: {
        userId: emp.id,
        status: "APPROVED",
        startDate: { lte: todayDate },
        endDate: { gte: todayDate },
      },
    });
    if (onLeave > 0) { skipped++; continue; }

    // Count pending predefined tasks (assigned but not done today)
    const totalAssigned = await prisma.taskAssignment.count({ where: { userId: emp.id } });
    const doneLogs = await prisma.dailyTaskLog.count({
      where: { userId: emp.id, date: todayDate, type: "PREDEFINED", done: true },
    });
    const pending = totalAssigned - doneLogs;

    if (pending <= 0) { skipped++; continue; }

    try {
      const body = renderTemplate(emailConfig.reminderBody, {
        name: emp.name,
        pendingCount: pending,
        date: dateStr,
      });

      await sendReminderEmail({
        to: emp.email,
        name: emp.name,
        date: dateStr,
        pendingCount: pending,
        cc: emailConfig.cc,
        body,
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send reminder to ${emp.email}:`, err);
    }
  }

  return Response.json({ ok: true, date: dateStr, sent, skipped });
}
