import { PlatformHeader } from "@/components/PlatformHeader";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

type AuthConfig = {
  provider: string;
  botUsername: string | null;
  configured: boolean;
};

/** Only same-origin paths may be used as a post-login destination. */
function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return "/bank";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/bank";
  return raw;
}

/**
 * Mounts Telegram's official widget script.
 *
 * The widget renders its own iframe button and refuses to work from a plain
 * link, so it has to be injected into the DOM rather than rendered by React.
 */
function TelegramLoginButton({ botUsername, returnTo }: { botUsername: string; returnTo: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    node.replaceChildren();

    const authUrl = new URL("/api/auth/telegram", window.location.origin);
    authUrl.searchParams.set("redirectTo", returnTo);

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-auth-url", authUrl.toString());
    script.setAttribute("data-request-access", "write");
    node.appendChild(script);

    return () => node.replaceChildren();
  }, [botUsername, returnTo]);

  return <div ref={container} className="min-h-[48px]" />;
}

export default function Login() {
  const [location] = useLocation();
  const { data: me, isLoading: meLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState(false);

  const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/config")
      .then(response => (response.ok ? response.json() : Promise.reject(new Error("config"))))
      .then((data: AuthConfig) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setConfigError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (me) window.location.href = returnTo;
  }, [me, returnTo]);

  return (
    <div className="min-h-screen bg-background">
      <PlatformHeader />
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Вход в «Школу 911»</h1>
          <p className="text-sm text-muted-foreground">
            Банк заданий ОГЭ открывается после входа. Мы используем Telegram — пароль не нужен.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6">
          {meLoading || (!config && !configError) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Загружаем форму входа…
            </div>
          ) : configError ? (
            <p className="text-sm text-destructive">
              Не удалось загрузить форму входа. Обновите страницу или попробуйте позже.
            </p>
          ) : config?.configured && config.botUsername ? (
            <div className="flex flex-col gap-4">
              <TelegramLoginButton botUsername={config.botUsername} returnTo={returnTo} />
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Telegram передаёт только имя и ссылку на профиль. Доступа к переписке у нас нет.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Вход через Telegram ещё не настроен на этом сервере. Задайте переменные
                окружения <code className="rounded bg-muted px-1">TELEGRAM_BOT_TOKEN</code> и{" "}
                <code className="rounded bg-muted px-1">TELEGRAM_BOT_USERNAME</code>.
              </p>
              <Button variant="outline" asChild>
                <a href="/">Вернуться на главную</a>
              </Button>
            </div>
          )}
        </div>

        {location !== "/login" ? null : (
          <p className="text-xs text-muted-foreground">
            Продолжая, вы соглашаетесь с тем, что мы храним ваш прогресс решения задач.
          </p>
        )}
      </main>
    </div>
  );
}
