import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Enrobe un handler async pour que toute rejection (erreur Prisma, bug
 * applicatif, panne DB transitoire...) soit transmise à next(err) plutôt
 * que de devenir une unhandled promise rejection — qui, sur Node 15+, tue
 * tout le process (donc toutes les organisations connectées) au lieu de se
 * limiter à la requête en cours. À utiliser sur chaque route async, avec le
 * middleware d'erreur global (voir index.ts) qui transforme l'erreur en
 * réponse JSON propre plutôt qu'en crash.
 */
export function asyncHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown
>(
  fn: (req: Request<P, ResBody, ReqBody>, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler<P, ResBody, ReqBody> {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
