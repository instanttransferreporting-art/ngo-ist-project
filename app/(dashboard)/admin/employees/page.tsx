"use client";

import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  createdAt: string;
}

export default function EmployeesPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "EMPLOYEE" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openCreate() {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", role: "EMPLOYEE" });
    setError("");
    setShowForm(true);
  }

  function openEdit(user: User) {
    setEditUser(user);
    setForm({ name: user.name, email: user.email, password: "", role: user.role });
    setError("");
    setShowForm(true);
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      let res: Response;
      if (editUser) {
        const body: Record<string, string> = { name: form.name, email: form.email, role: form.role };
        if (form.password) body.password = form.password;
        res = await fetch(`/api/users/${editUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur"); return; }

      setSuccess(editUser ? "Utilisateur mis à jour" : "Utilisateur créé");
      setShowForm(false);
      fetchUsers();
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Supprimer ${name} ? Cette action est irréversible.`)) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) fetchUsers();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employés</h1>
          <p className="text-slate-500 mt-1">Gérer les comptes utilisateurs</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Ajouter un utilisateur
        </button>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{editUser ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveUser} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom complet</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Mot de passe {editUser && <span className="text-slate-400 font-normal">(laisser vide pour ne pas changer)</span>}
                </label>
                <input type="password" {...(!editUser ? { required: true } : {})}
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Rôle</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
                  <option value="EMPLOYEE">Employé</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-slate-400">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Nom</th>
                  <th className="text-left px-6 py-3 font-medium">Email</th>
                  <th className="text-center px-4 py-3 font-medium">Rôle</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-900">{user.name}</td>
                    <td className="px-6 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${user.role === "ADMIN" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {user.role === "ADMIN" ? "Admin" : "Employé"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                          <a href={`/admin/employees/${user.id}`}
                          className="text-xs text-blue-700 hover:underline font-medium">Fiche</a>
                        <button onClick={() => openEdit(user)}
                          className="text-xs text-slate-600 hover:text-slate-900 font-medium">Modifier</button>
                        <button onClick={() => deleteUser(user.id, user.name)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium">Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-400">Aucun utilisateur</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
