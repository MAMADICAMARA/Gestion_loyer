"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import {
  AlertIcon,
  BriefcaseIcon,
  BuildingIcon,
  CardIcon,
  CloseIcon,
  FileIcon,
  GridIcon,
  LogoutIcon,
  MenuIcon,
  UserCogIcon,
  UsersIcon,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Tableau de bord", icon: GridIcon },
  { href: "/properties", label: "Propriétés", icon: BuildingIcon },
  { href: "/tenants", label: "Locataires", icon: UsersIcon },
  { href: "/contracts", label: "Contrats", icon: FileIcon },
  { href: "/invoices", label: "Facturation", icon: CardIcon },
  { href: "/impayes", label: "Impayés", icon: AlertIcon },
  { href: "/owners", label: "Propriétaires", icon: BriefcaseIcon },
  // Visible seulement owner/admin (matrice de permissions, Partie 2) —
  // l'API le bloque de toute façon, ceci n'est qu'un confort de navigation.
  { href: "/users", label: "Équipe", icon: UserCogIcon, roles: ["owner", "admin"] },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { me, logout } = useAuth();
  const initials = me.email.slice(0, 2).toUpperCase();

  return (
    <>
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <div className="w-7 h-7 rounded-md bg-laterite flex items-center justify-center font-bold text-sm shrink-0">
          G
        </div>
        <span className="font-mono text-[10px] tracking-widest text-[#bba995]">GÉRA</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(me.role)).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                active ? "bg-laterite/20 text-white" : "text-[#bba995] hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-laterite" : ""}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5 pt-4 mt-2 border-t border-white/10">
        <div className="w-7 h-7 rounded-full bg-gold text-[#1a1210] flex items-center justify-center text-[11px] font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white truncate">{me.email}</p>
          <p className="text-[11px] text-[#bba995]">{me.role}</p>
        </div>
        <button
          onClick={logout}
          title="Se déconnecter"
          className="p-1.5 rounded-md text-[#bba995] hover:text-white hover:bg-white/5 transition shrink-0"
        >
          <LogoutIcon className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // Referme le tiroir mobile à chaque changement de page.
  useEffect(() => setNavOpen(false), [pathname]);

  // Cet espace agence est fermé au rôle owner_viewer (l'API le refuse déjà
  // — cf. requireAgencyStaff — ceci n'est qu'un confort de navigation).
  useEffect(() => {
    if (me.role === "owner_viewer") router.replace("/portal");
  }, [me.role, router]);

  if (me.role === "owner_viewer") return null;

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Sidebar desktop — toujours visible à partir de md */}
      <aside className="hidden md:flex w-56 shrink-0 bg-[#18130f] text-[#f5eee3] flex-col px-3 py-5">
        <SidebarContent />
      </aside>

      {/* Tiroir mobile — overlay plein écran sous md */}
      {navOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <button
            aria-label="Fermer le menu"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative w-64 max-w-[80vw] bg-[#18130f] text-[#f5eee3] flex flex-col px-3 py-5">
            <button
              onClick={() => setNavOpen(false)}
              aria-label="Fermer le menu"
              className="absolute top-4 right-3 p-1 rounded-md text-[#bba995] hover:text-white transition"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
            <SidebarContent onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barre supérieure mobile uniquement — porte d'accès au menu */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-line bg-white sticky top-0 z-30">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Ouvrir le menu"
            className="p-1.5 -ml-1.5 rounded-md text-ink hover:bg-paper-2 transition"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <div className="w-6 h-6 rounded-md bg-laterite flex items-center justify-center font-bold text-xs text-white">
            G
          </div>
          <span className="font-mono text-[10px] tracking-widest text-sub">GÉRA</span>
        </div>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
