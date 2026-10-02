"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ApiError,
  deleteDocument,
  listDocuments,
  uploadDocument,
  type AppDocument,
  type RelatedType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FileIcon, PlusIcon } from "@/components/icons";

const CAN_DELETE_ROLES = ["owner", "admin", "manager"];

function formatFileType(fileType: string | null): string {
  if (!fileType) return "Fichier";
  if (fileType === "application/pdf") return "PDF";
  if (fileType.startsWith("image/")) return fileType.replace("image/", "").toUpperCase();
  return fileType;
}

interface DocumentsPanelProps {
  relatedType: RelatedType;
  relatedId: string;
}

// Contrats, pièces d'identité, justificatifs (cahier des charges, module
// Documents) : jamais stockés en base, toujours via le stockage objet —
// ce panneau est le seul point d'upload/téléchargement, réutilisable sur
// n'importe quelle fiche (locataire, contrat, garant, propriété...).
export function DocumentsPanel({ relatedType, relatedId }: DocumentsPanelProps) {
  const { me } = useAuth();
  const [documents, setDocuments] = useState<AppDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reload() {
    listDocuments(relatedType, relatedId)
      .then(setDocuments)
      .catch(() => setError("Impossible de charger les documents."));
  }

  useEffect(reload, [relatedType, relatedId]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await uploadDocument(relatedType, relatedId, file);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'envoi du fichier.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce document ?")) return;
    try {
      await deleteDocument(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de la suppression.");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-xs font-bold text-sub uppercase flex items-center gap-1.5">
          <FileIcon className="w-3.5 h-3.5" />
          Documents {documents ? `(${documents.length})` : ""}
        </h2>
        <label className="flex items-center gap-1 text-xs font-semibold text-indigo hover:underline cursor-pointer">
          <PlusIcon className="w-3 h-3" />
          {uploading ? "Envoi…" : "Ajouter un document"}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {error && <p className="text-sm text-critical mb-2">{error}</p>}

      {documents && documents.length === 0 && <p className="text-sm text-sub">Aucun document pour l&apos;instant.</p>}

      {documents && documents.length > 0 && (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 border-t border-paper-2 pt-2.5 first:border-0 first:pt-0"
            >
              <a
                href={doc.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-ink hover:underline truncate max-w-[220px]"
              >
                {doc.fileName}
              </a>
              <div className="flex items-center gap-3">
                <span className="text-xs text-sub">{formatFileType(doc.fileType)}</span>
                <span className="text-xs text-sub">{new Date(doc.createdAt).toLocaleDateString("fr-FR")}</span>
                {CAN_DELETE_ROLES.includes(me.role) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    className="text-xs font-semibold text-critical hover:underline"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
