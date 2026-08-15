import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import { getDb } from "../db";
import { editorialAccessRoles } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

async function resolveEditorialRole(user: NonNullable<TrpcContext["user"]>) {
  if (user.openId === ENV.ownerOpenId) return "owner" as const;
  const db = await getDb();
  const [access] = db ? await db.select({ role: editorialAccessRoles.role, isActive: editorialAccessRoles.isActive }).from(editorialAccessRoles).where(eq(editorialAccessRoles.userId, user.id)).limit(1) : [];
  if (access) return access.isActive ? access.role : null;
  return user.role === "admin" ? ("admin" as const) : null;
}

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !await resolveEditorialRole(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const ownerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || await resolveEditorialRole(ctx.user) !== "owner") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Управление администраторами доступно только владельцу платформы." });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
