"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  inviteUser,
  listUsers,
  updateUser,
  type AgencyRole,
  type AgencyUser,
} from "@/lib/api";
import { Modal } from "@/components/Modal";
import { PlusIcon } from "@/components/icons";
import { Pagination } from "@/components/Pagination";

const ROLE_LABEL: Record<AgencyRole, string> = {
  owner: "Propriétaire du compte",
  admin: "Administrateur",
  manager: "Gestionnaire",
  agent: "Agent",
};

const ROLES: AgencyRole[] = ["admin", "manager", "agent"];

export default function UsersPage() {
  const [users, setUsers] = useState<AgencyUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AgencyRole>("agent");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reload() {
    listUsers({ page })
      .then((res) => {
        setUsers(res.data);
        setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
      })
      .catch(() => setError("Impossible de charger l'équipe."));
  }

  useEffect(reload, [page]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await inviteUser({ email, password, role });
      setEmail("");
      setPassword("");
      setRole("agent");
      setShowModal(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: AgencyRole) {
    await updateUser(userId, { role: newRole });
    reload();
  }

  async function handleToggleActive(user: AgencyUser) {
    await updateUser(user.id, { isActive: !user.isActive });
    reload();
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Équipe</h1>
          <p className="text-sm text-sub mt-1">
            {users ? `${pagination.total} membre${pagination.total > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-laterite text-white text-sm font-semibold px-4 py-2.5 hover:bg-laterite-dark transition"
        >
          <PlusIcon className="w-4 h-4" />
          Inviter un collègue
        </button>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Inviter un collègue">
        <form onSubmit={handleInvite} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Mot de passe initial</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-sub mb-1.5">Rôle</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AgencyRole)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          {formError && <p className="text-sm text-critical">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition disabled:opacity-60"
          >
            {saving ? "Invitation…" : "Inviter"}
          </button>
        </form>
      </Modal>

      {users && users.length > 0 && (
        <div className="rounded-xl border border-line bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-sub uppercase bg-paper-2">
                <th className="px-4 py-2.5 font-semibold">Membre</th>
                <th className="px-4 py-2.5 font-semibold">Rôle</th>
                <th className="px-4 py-2.5 font-semibold">Statut</th>
                <th className="px-4 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-paper-2">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{user.email}</p>
                    <p className="text-xs text-sub">
                      {user.lastLoginAt
                        ? `Vu le ${new Date(user.lastLoginAt).toLocaleDateString("fr-FR")}`
                        : "Jamais connecté"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {user.role === "owner" ? (
                      <span className="text-sub">{ROLE_LABEL.owner}</span>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as AgencyRole)}
                        className="rounded-lg border border-line px-2 py-1 text-xs outline-none focus:border-laterite"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        user.isActive ? "bg-success-tint text-success" : "bg-paper-2 text-sub"
                      }`}
                    >
                      {user.isActive ? "Actif" : "Désactivé"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.role !== "owner" && (
                      <button
                        onClick={() => handleToggleActive(user)}
                        className="text-xs font-semibold text-indigo hover:underline"
                      >
                        {user.isActive ? "Désactiver" : "Réactiver"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={setPage} />
    </div>
  );
}
