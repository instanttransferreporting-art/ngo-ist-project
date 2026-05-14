import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EmployeeSheetView } from "@/components/EmployeeSheetView";
import Link from "next/link";

type Params = { params: Promise<{ id: string }> };

export default async function AdminEmployeeView({ params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) redirect("/admin/employees");

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/employees" className="text-slate-400 hover:text-slate-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
          <p className="text-slate-500 text-sm">{user.email}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <a
            href={`/api/export/employee/${id}`}
            className="flex items-center gap-2 px-3 py-2 bg-green-700 hover:bg-green-800 text-white font-medium rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exporter Excel
          </a>
        </div>
      </div>

      <EmployeeSheetView userId={id} isAdmin={true} />
    </div>
  );
}
