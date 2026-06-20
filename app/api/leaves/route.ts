import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendLeaveRequestNotification } from "@/lib/email";
import { z } from "zod";

const createSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
  userId: z.string().optional(),
  leaveType: z.enum(["PERMISSION", "CONGE", "MALADIE", "ABSENCE"]).default("CONGE"),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("userId");
  const status = req.nextUrl.searchParams.get("status");

  let where: Record<string, unknown> = {};

  if (session.role === "ADMIN") {
    if (userId) where.userId = userId;
    if (status) where.status = status;
  } else {
    where.userId = session.userId;
  }

  const leaves = await prisma.leaveRequest.findMany({
    where,
    include: { user: { select: { name: true, email: true } } },
    orderBy: { startDate: "desc" },
  });

  return Response.json(leaves);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  const { startDate, endDate, reason, userId: bodyUserId, leaveType } = parsed.data;

  if (new Date(startDate) > new Date(endDate)) {
    return Response.json({ error: "La date de fin doit être après la date de début" }, { status: 400 });
  }

  const targetUserId = session.role === "ADMIN" && bodyUserId ? bodyUserId : session.userId;
  const status = session.role === "ADMIN" && bodyUserId ? "APPROVED" : "PENDING";

  const leave = await prisma.leaveRequest.create({
    data: {
      userId: targetUserId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
      status,
      leaveType,
    },
    include: { user: { select: { name: true, email: true } } },
  });

  // Notify all admins when an employee submits a leave request (fire-and-forget)
  if (status === "PENDING") {
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } })
      .then((admins) => {
        const adminEmails = admins.map((a) => a.email).filter(Boolean);
        if (adminEmails.length > 0) {
          sendLeaveRequestNotification({
            to: adminEmails,
            employeeName: leave.user.name,
            startDate,
            endDate,
            reason,
          }).catch(() => {/* silent */});
        }
      })
      .catch(() => {/* silent */});
  }

  return Response.json(leave, { status: 201 });
}
