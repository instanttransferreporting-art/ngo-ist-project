import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendLeaveStatusNotification } from "@/lib/email";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  const leave = await prisma.leaveRequest.update({
    where: { id },
    data: { status: parsed.data.status },
    include: { user: { select: { name: true, email: true } } },
  });

  // Notify the employee of the decision (fire-and-forget)
  sendLeaveStatusNotification({
    to: leave.user.email,
    name: leave.user.name,
    status: leave.status as "APPROVED" | "REJECTED",
    startDate: leave.startDate.toISOString().slice(0, 10),
    endDate: leave.endDate.toISOString().slice(0, 10),
  }).catch(() => {/* silent */});

  return Response.json(leave);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave) return Response.json({ error: "Congé introuvable" }, { status: 404 });

  // Only the owner or admin can delete
  if (session.role !== "ADMIN" && session.userId !== leave.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot delete approved leaves
  if (leave.status === "APPROVED" && session.role !== "ADMIN") {
    return Response.json({ error: "Impossible de supprimer un congé approuvé" }, { status: 400 });
  }

  await prisma.leaveRequest.delete({ where: { id } });
  return Response.json({ ok: true });
}
