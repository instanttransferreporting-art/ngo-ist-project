"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

interface LeaveRequest {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  user: { name: string; email: string };
}

const statusLabels = { PENDING: "En attente", APPROVED: "Approuvé", REJECTED: "Refusé" };
const statusColors = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function LeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("PENDING");

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    const url = filterStatus ? `/api/leaves?status=${filterStatus}` : "/api/leaves";
    const res = await fetch(url);
    if (res.ok) setLeaves(await res.json());
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  async function updateStatus(id: string, status: "APPROVED" | "REJECTED") {
    const res = await fetch(`/api/leaves/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchLeaves();
  }

  const formatDate = (d: string) => format(parseISO(d), "dd MMM yyyy", { locale: fr });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Demandes de congés</h1>
        <p className="text-slate-500 mt-1">Approuver ou refuser les demandes des employés</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {[
          { value: "PENDING", label: "En attente" },
          { value: "APPROVED", label: "Approuvés" },
          { value: "REJECTED", label: "Refusés" },
          { value: "", label: "Tous" },
        ].map((f) => (
          <button key={f.value} onClick={() => setFilterStatus(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === f.value ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-slate-400">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Employé</th>
                  <th className="text-left px-4 py-3 font-medium">Du</th>
                  <th className="text-left px-4 py-3 font-medium">Au</th>
                  <th className="text-left px-4 py-3 font-medium">Motif</th>
                  <th className="text-center px-4 py-3 font-medium">Statut</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.map((leave) => (
                  <tr key={leave.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-900">{leave.user.name}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(leave.startDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(leave.endDate)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{leave.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[leave.status]}`}>
                        {statusLabels[leave.status]}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {leave.status === "PENDING" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => updateStatus(leave.id, "APPROVED")}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">
                            Approuver
                          </button>
                          <button onClick={() => updateStatus(leave.id, "REJECTED")}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors">
                            Refuser
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Aucune demande</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
