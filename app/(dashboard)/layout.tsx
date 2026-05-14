import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={session.role} name={session.name} />
      {/* Main content — offset for sidebar */}
      <main className="flex-1 lg:ml-64 min-w-0">
        <div className="p-4 lg:p-8 pt-16 lg:pt-8">{children}</div>
      </main>
    </div>
  );
}
