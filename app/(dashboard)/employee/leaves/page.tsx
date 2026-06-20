"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  leaveType: "PERMISSION" | "CONGE" | "MALADIE" | "ABSENCE";
  createdAt: string;
}

const statusLabels = { PENDING: "En attente", APPROVED: "Approuvé", REJECTED: "Refusé" };
const statusColors = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

const leaveTypeLabels = { PERMISSION: "Permission", CONGE: "Congé", MALADIE: "Maladie", ABSENCE: "Absence" };
const leaveTypeColors = {
  PERMISSION: "bg-blue-100 text-blue-700",
  CONGE: "bg-green-100 text-green-700",
  MALADIE: "bg-red-100 text-red-700",
  ABSENCE: "bg-orange-100 text-orange-700",
};

export default function EmployeeLeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: "", endDate: "", reason: "", leaveType: "CONGE" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/leaves");
    if (res.ok) setLeaves(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Erreur"); setSaving(false); return; }

    setShowForm(false);
    setForm({ startDate: "", endDate: "", reason: "", leaveType: "CONGE" });
    fetchLeaves();
    setSaving(false);
  }

  async function cancelLeave(id: string) {
    if (!confirm("Annuler cette demande ?")) return;
    await fetch(`/api/leaves/${id}`, { method: "DELETE" });
    fetchLeaves();
  }

  const formatDate = (d: string) => format(parseISO(d), "dd MMMM yyyy", { locale: fr });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mes congés</h1>
          <p className="text-slate-500 mt-1">Soumettre et suivre vos demandes de congé</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(""); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Demander un congé
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Nouvelle demande de congé</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={submitLeave} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Type de congé</label>
                <select required value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
                  <option value="PERMISSION">Permission</option>
                  <option value="CONGE">Congé</option>
                  <option value="MALADIE">Maladie</option>
                  <option value="ABSENCE">Absence</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Date de début</label>
                <input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Date de fin</label>
                <input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  min={form.startDate}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Motif <span className="text-slate-400 font-normal">(optionnel)</span></label>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3} placeholder="Motif du congé..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Annuler</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium">
                  {saving ? "Envoi..." : "Soumettre"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave list */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-slate-400">Chargement...</div>
        ) : leaves.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-400">Aucune demande de congé</p>
            <button onClick={() => setShowForm(true)}
              className="mt-3 text-sm text-blue-700 hover:underline">Faire une première demande</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {leaves.map((leave) => (
              <div key={leave.id} className="px-6 py-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${leaveTypeColors[leave.leaveType]}`}>
                      {leaveTypeLabels[leave.leaveType]}
                    </span>
                    <span className="font-medium text-slate-800">
                      Du {formatDate(leave.startDate)} au {formatDate(leave.endDate)}
                    </span>
                  </div>
                  {leave.reason && <div className="text-sm text-slate-500 mt-0.5">{leave.reason}</div>}
                  <div className="text-xs text-slate-400 mt-1">
                    Demande soumise le {format(parseISO(leave.createdAt), "dd/MM/yyyy")}
                  </div>
                </div>
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[leave.status]}`}>
                  {statusLabels[leave.status]}
                </span>
                {leave.status === "PENDING" && (
                  <button onClick={() => cancelLeave(leave.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium">Annuler</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
