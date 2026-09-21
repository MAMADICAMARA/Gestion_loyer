"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      // MVP : jeton en mémoire de session le temps de brancher le vrai
      // stockage (refresh rotatif + révocation Redis, cf. cahier des
      // charges Partie 3) — suffisant pour valider la boucle de bout en bout.
      sessionStorage.setItem("gera_access_token", result.accessToken);
      sessionStorage.setItem("gera_user_email", result.user.email);
      router.push(result.user.role === "owner_viewer" ? "/portal" : "/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Impossible de joindre le serveur. Réessayez.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Panneau de marque — masqué sur mobile */}
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-between bg-[#18130f] text-[#f5eee3] px-12 py-12">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-laterite flex items-center justify-center font-bold text-[#18130f]">
            G
          </div>
          <span className="font-mono text-xs tracking-widest text-[#bba995]">
            GÉRA · GESTION LOCATIVE
          </span>
        </div>

        <div>
          <h1 className="text-4xl font-semibold leading-tight mb-4">
            Savoir qui a payé,<br />qui doit encore,<br />et combien vous revient.
          </h1>
          <p className="text-[#bba995] text-sm max-w-sm leading-relaxed">
            Propriétés, locataires, contrats, loyers et impayés — centralisés,
            sécurisés, accessibles depuis n&apos;importe quel appareil.
          </p>
        </div>

        <p className="font-mono text-xs text-[#bba995]">Conakry · Guinée</p>
      </div>

      {/* Formulaire */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 bg-paper">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-8 h-8 rounded-md bg-laterite flex items-center justify-center font-bold text-white">
              G
            </div>
            <span className="font-mono text-xs tracking-widest text-sub">
              GÉRA · GESTION LOCATIVE
            </span>
          </div>

          <h2 className="text-2xl font-semibold text-ink mb-1">Connexion</h2>
          <p className="text-sm text-sub mb-8">
            Accédez à l&apos;espace de votre organisation.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-sub mb-1.5">
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ibrahima@horizon-immobilier.gn"
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-sub/60 outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20 transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-sub">
                  Mot de passe
                </label>
                <a href="#" className="text-xs font-semibold text-indigo hover:underline">
                  Mot de passe oublié ?
                </a>
              </div>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-laterite focus:ring-2 focus:ring-laterite/20 transition"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg bg-critical-tint text-critical text-sm px-3.5 py-2.5"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-laterite text-white text-sm font-semibold py-2.5 hover:bg-laterite-dark transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Connexion en cours…" : "Se connecter"}
            </button>
          </form>

          <p className="mt-8 text-xs text-sub text-center">
            Pas encore de compte ?{" "}
            <a href="#" className="font-semibold text-indigo hover:underline">
              Contacter votre agence
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
