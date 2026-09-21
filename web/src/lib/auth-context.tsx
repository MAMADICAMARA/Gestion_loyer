"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Me {
  id: string;
  email: string;
  role: string;
  organization: { name: string; orgType: string };
}

interface AuthContextValue {
  me: Me;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() doit être utilisé sous AuthProvider.");
  return ctx;
}

/**
 * Garde d'authentification partagée par toutes les routes de (app) :
 * vérifie la session au montage, redirige vers /login si invalide, et
 * expose l'utilisateur courant aux pages enfants — évite de dupliquer la
 * logique de vérification (auparavant propre à dashboard/page.tsx).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("gera_access_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Session invalide.");
        return res.json();
      })
      .then((data: Me) => {
        setMe(data);
        setChecked(true);
      })
      .catch(() => {
        sessionStorage.removeItem("gera_access_token");
        router.replace("/login");
      });
  }, [router]);

  function logout() {
    sessionStorage.removeItem("gera_access_token");
    router.replace("/login");
  }

  if (!checked || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-sub">Vérification de la session…</p>
      </div>
    );
  }

  return <AuthContext.Provider value={{ me, logout }}>{children}</AuthContext.Provider>;
}
