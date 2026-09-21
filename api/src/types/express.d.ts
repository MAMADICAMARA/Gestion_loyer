import "express";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        role: string;
      };
      /** Posé par resolveOwnerScope (routes/portal.ts) pour le rôle owner_viewer. */
      ownerId?: string;
    }
  }
}

export {};
