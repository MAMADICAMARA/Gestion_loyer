import { PrismaClient } from "@prisma/client";

// Une seule instance de PrismaClient pour tout le process — évite d'épuiser
// le pool de connexions PostgreSQL en développement (rechargements à chaud).
export const prisma = new PrismaClient();
