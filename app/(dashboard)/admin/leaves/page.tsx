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
  leaveType: "PERMISSION" | "CONGE" | "MALADIE" | "ABSENCE";
  createdAt: string;
  user: { name: string; email: string };
}

interface Employee {
  id: string;
  name: string;
  role: string;
}

const leaveTypeLabels = { PERMISSION: "Permission", CONGE: "Congé", MALADIE: "Maladie", ABSENCE: "Absence" };
const leaveTypeColors = {
  PERMISSION: "bg-blue-100 text-blue-700",
  CONGE: "bg-green-100 text-green-700",
  MALADIE: "bg-red-100 text-red-700",
  ABSENCE: "bg-orange-100 text-orange-700",
};

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
  const [users, setUsers] = useState<Employee[]>([]);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ userId: "", startDate: "", endDate: "", reason: "", leaveType: "CONGE" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    const url = filterStatus ? `/api/leaves?status=${filterStatus}` : "/api/leaves";
    const res = await fetch(url);
    if (res.ok) setLeaves(await res.json());
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/users");
      if (res.ok && !cancelled) {
        const all: Employee[] = await res.json();
        setUsers(all.filter((u) => u.role === "EMPLOYEE"));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    const res = await fetch("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreateError(data.error ?? "Erreur");
      setCreating(false);
      return;
    }
    setShowCreate(false);
    setCreateForm({ userId: "", startDate: "", endDate: "", reason: "" });
    fetchLeaves();
    setCreating(false);
  }

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Demandes de congés</h1>
          <p className="text-slate-500 mt-1">Approuver ou refuser les demandes des employés</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Enregistrer un congé
        </button>
      </div>

      {/* ── Admin create leave modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Enregistrer un congé</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{createError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Employé</label>
                <select
                  required
                  value={createForm.userId}
                  onChange={(e) => setCreateForm({ ...createForm, userId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                >
                  <option value="">-- Sélectionner un employé --</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Type de congé</label>
                <select
                  value={createForm.leaveType}
                  onChange={(e) => setCreateForm({ ...createForm, leaveType: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                >
                  <option value="PERMISSION">Permission</option>
                  <option value="CONGE">Congé</option>
                  <option value="MALADIE">Maladie</option>
                  <option value="ABSENCE">Absence</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Début</label>
                  <input
                    type="date" required
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Fin</label>
                  <input
                    type="date" required
                    value={createForm.endDate}
                    onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Motif <span className="text-slate-400 font-normal">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={createForm.reason}
                  onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
                  placeholder="Ex: Vacances annuelles, Maladie..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <p className="text-xs text-slate-500">
                Le congé sera enregistré avec le statut <strong>Approuvé</strong> automatiquement.
              </p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Annuler
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium">
                  {creating ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  <th className="text-left px-4 py-3 font-medium">Type</th>
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
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${leaveTypeColors[leave.leaveType]}`}>
                        {leaveTypeLabels[leave.leaveType]}
                      </span>
                    </td>
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
