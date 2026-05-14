import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EmployeeSheetView } from "@/components/EmployeeSheetView";

export default async function EmployeePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "ADMIN") redirect("/admin");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Mon espace</h1>
        <p className="text-slate-500 mt-1">Bonjour {session.name} — gérez vos tâches du mois</p>
      </div>

      <EmployeeSheetView userId={session.userId} isAdmin={false} />
    </div>
  );
}
