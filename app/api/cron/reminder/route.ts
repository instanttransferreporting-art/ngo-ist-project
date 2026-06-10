import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendGroupReminderEmail } from "@/lib/email";
import { getSession } from "@/lib/auth";
import { isSunday, format } from "date-fns";

type EmailConfigShape = {
  id: string;
  recipients: string[];
  reminderRecipients: string[];
  dailyRecipients: string[];
  monthlyRecipients: string[];
  cc: string[];
  reminderBody: string;
  reportBody: string;
  monthlyReportBody: string;
};

/**
 * GET /api/cron/reminder  — called by Vercel Cron (GET)
 * POST /api/cron/reminder — manual trigger from admin UI
 * Sends a reminder email to every employee who hasn't completed all tasks today.
 */
async function handler(req: NextRequest) {
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

  const defaultEmailConfig: EmailConfigShape = {
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

  let emailConfig: EmailConfigShape = defaultEmailConfig;
  try {
    emailConfig = await prisma.emailConfig.upsert({
      where: { id: "global" },
      update: {},
      create: defaultEmailConfig,
    });
  } catch {
    // Keep default values when DB schema is behind code.
  }

  const employees = await prisma.user.findMany({ where: { role: "EMPLOYEE" } });
  let sent = 0;
  let skipped = 0;
  let hasPending = false;

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

    hasPending = true;
  }

  if (hasPending) {
    const recipients = emailConfig.reminderRecipients.length > 0
      ? emailConfig.reminderRecipients
      : emailConfig.recipients;

    if (recipients.length > 0) {
      try {
        await sendGroupReminderEmail({
          to: recipients,
          date: dateStr,
          cc: emailConfig.cc.length > 0 ? emailConfig.cc : undefined,
        });
        sent = 1;
      } catch (err) {
        console.error("Failed to send group reminder email:", err);
      }
    }
  }

  return Response.json({ ok: true, date: dateStr, sent, skipped });
}

export { handler as GET, handler as POST };
