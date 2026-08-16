import { PlatformHeader } from "@/components/PlatformHeader";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Loader2, Lock } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Gate for pages that require a signed-in visitor.
 *
 * The bank holds material from the ФИПИ open bank, which the project uses in
 * internal mode: the site is on the public internet, the tasks are not. The
 * landing page stays open — it is the shop window.
 *
 * This is a convenience redirect, not the security boundary. Every procedure
 * behind it enforces its own access check server-side.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="theme-page min-h-screen">
        <PlatformHeader />
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#ff5b14]" aria-label="Загрузка" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="theme-page min-h-screen">
        <PlatformHeader />
        <main className="container grid min-h-[60vh] place-items-center py-12">
          <div className="theme-surface max-w-md rounded-[22px] border border-white/9 p-7 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#ff5b14]/12">
              <Lock className="h-5 w-5 text-[#ff8b4b]" aria-hidden />
            </div>
            <h1 className="mt-5 text-xl font-extrabold tracking-[-.03em]">Банк открывается после входа</h1>
            <p className="theme-muted mt-3 text-sm leading-6">
              Задания и разборы доступны ученикам школы. Вход через Telegram, пароль не нужен.
            </p>
            <Button
              onClick={() => startLogin()}
              className="mt-6 w-full rounded-xl bg-[#ff5b14] font-bold text-[#101014] hover:bg-[#ff7a35]"
            >
              Войти через Telegram
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
