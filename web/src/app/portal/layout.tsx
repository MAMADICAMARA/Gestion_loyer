"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { BriefcaseIcon, CardIcon, CloseIcon, EyeIcon, FileIcon, LogoutIcon, MenuIcon } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/portal", label: "Mon patrimoine", icon: BriefcaseIcon },
  { href: "/portal/payments", label: "Paiements", icon: FileIcon },
  { href: "/portal/payouts", label: "Versements", icon: CardIcon },
];

function PortalSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { me, logout } = useAuth();
  const initials = me.email.slice(0, 2).toUpperCase();

  return (
    <>
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <div className="w-7 h-7 rounded-md bg-indigo flex items-center justify-center font-bold text-sm shrink-0 text-white">
          G
        </div>
        <span className="font-mono text-[10px] tracking-widest text-[#B9C2E0]">GÉRA · PORTAIL</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                active ? "bg-white/15 text-white" : "text-[#B9C2E0] hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
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
          <p className="text-[11px] text-[#B9C2E0] flex items-center gap-1">
            <EyeIcon className="w-3 h-3" /> Lecture seule
          </p>
        </div>
        <button
          onClick={logout}
          title="Se déconnecter"
          className="p-1.5 rounded-md text-[#B9C2E0] hover:text-white hover:bg-white/5 transition shrink-0"
        >
          <LogoutIcon className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

function PortalShell({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => setNavOpen(false), [pathname]);

  // Ce portail est réservé au rôle owner_viewer — un membre de l'agence qui
  // atterrit ici (lien partagé par erreur, etc.) est renvoyé à son espace.
  useEffect(() => {
    if (me.role !== "owner_viewer") router.replace("/dashboard");
  }, [me.role, router]);

  if (me.role !== "owner_viewer") return null;

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="hidden md:flex w-56 shrink-0 bg-indigo flex-col px-3 py-5">
        <PortalSidebarContent />
      </aside>

      {navOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <button aria-label="Fermer le menu" onClick={() => setNavOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative w-64 max-w-[80vw] bg-indigo flex flex-col px-3 py-5">
            <button
              onClick={() => setNavOpen(false)}
              aria-label="Fermer le menu"
              className="absolute top-4 right-3 p-1 rounded-md text-[#B9C2E0] hover:text-white transition"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
            <PortalSidebarContent onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-line bg-white sticky top-0 z-30">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Ouvrir le menu"
            className="p-1.5 -ml-1.5 rounded-md text-ink hover:bg-paper-2 transition"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <div className="w-6 h-6 rounded-md bg-indigo flex items-center justify-center font-bold text-xs text-white">
            G
          </div>
          <span className="font-mono text-[10px] tracking-widest text-sub">GÉRA · PORTAIL</span>
        </div>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <PortalShell>{children}</PortalShell>
    </AuthProvider>
  );
}
