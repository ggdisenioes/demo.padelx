// ./app/components/AppShell.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Sidebar from "./Sidebar";
import LanguageSelector from "./LanguageSelector";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { useTranslation } from "../i18n";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const SESSION_MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000; // 30 seconds
const SESSION_STARTED_AT_KEY = "padelx.sessionStartedAt";
const SESSION_LAST_ACTIVITY_AT_KEY = "padelx.sessionLastActivityAt";
const SESSION_USER_ID_KEY = "padelx.sessionUserId";
const PREFETCH_ROUTES = [
  "/",
  "/matches",
  "/ranking",
  "/tournaments",
  "/players",
  "/news",
  "/mi-cuenta",
];

function buildCleanUrl(pathname: string, params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

const ERROR_KEYS: Record<string, string> = {
  tenant_incorrecto: "errors.tenantIncorrecto",
  usuario_deshabilitado: "errors.usuarioDeshabilitado",
  tenant_no_asignado: "errors.tenantNoAsignado",
  perfil_no_encontrado: "errors.perfilNoEncontrado",
  tenant_invalido: "errors.tenantInvalido",
  config_supabase: "errors.configSupabase",
  session_expired: "auth.sessionExpired",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();

  const [checkingSession, setCheckingSession] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  const lastActivityWriteRef = useRef(0);

  // Evita duplicar toasts en re-renders
  const lastToastKeyRef = useRef<string>("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [pathname]);

  // 1) Session guard
  useEffect(() => {
    if (isAuthPage) {
      sessionStorage.removeItem("unauthorized_redirect");
      queueMicrotask(() => setCheckingSession(false));
      return;
    }

    const checkSession = async () => {
      // Si falta configuración de Supabase, no rompemos el build ni el runtime.
      // Redirigimos al login para evitar pantallas en blanco.
      if (!isSupabaseConfigured) {
        setCheckingSession(false);
        router.replace("/login?error=config_supabase");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        // Retry corto para evitar falsos negativos de sesión en mobile.
        await new Promise((resolve) => setTimeout(resolve, 150));
        const {
          data: { session: retriedSession },
        } = await supabase.auth.getSession();

        if (!retriedSession) {
          router.replace("/login");
          return;
        }
      }

      setCheckingSession(false);
    };

    checkSession();
  }, [isAuthPage, router]);

  // 2) Security timeout guard (inactivity + max session age)
  useEffect(() => {
    if (isAuthPage || typeof window === "undefined") return;

    let active = true;

    const writeSessionTimestamps = (userId: string) => {
      const now = Date.now();
      window.localStorage.setItem(SESSION_USER_ID_KEY, userId);
      window.localStorage.setItem(SESSION_STARTED_AT_KEY, String(now));
      window.localStorage.setItem(SESSION_LAST_ACTIVITY_AT_KEY, String(now));
      lastActivityWriteRef.current = now;
    };

    const removeSessionTimestamps = () => {
      window.localStorage.removeItem(SESSION_USER_ID_KEY);
      window.localStorage.removeItem(SESSION_STARTED_AT_KEY);
      window.localStorage.removeItem(SESSION_LAST_ACTIVITY_AT_KEY);
    };

    const touchActivity = () => {
      const now = Date.now();
      if (now - lastActivityWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      window.localStorage.setItem(SESSION_LAST_ACTIVITY_AT_KEY, String(now));
      lastActivityWriteRef.current = now;
    };

    const checkTimeout = async () => {
      if (!active) return;
      if (!isSupabaseConfigured) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const now = Date.now();
      const userId = session.user.id;
      const storedUserId = window.localStorage.getItem(SESSION_USER_ID_KEY);
      const startedAt = Number(window.localStorage.getItem(SESSION_STARTED_AT_KEY));
      const lastActivityAt = Number(
        window.localStorage.getItem(SESSION_LAST_ACTIVITY_AT_KEY)
      );

      if (storedUserId !== userId || !Number.isFinite(startedAt) || !Number.isFinite(lastActivityAt)) {
        writeSessionTimestamps(userId);
        return;
      }

      const maxAgeExceeded = now - startedAt > SESSION_MAX_DURATION_MS;
      const inactivityExceeded = now - lastActivityAt > SESSION_INACTIVITY_TIMEOUT_MS;
      if (!maxAgeExceeded && !inactivityExceeded) return;

      removeSessionTimestamps();
      await supabase.auth.signOut();
      if (active) {
        router.replace("/login?error=session_expired");
      }
    };

    const activityEvents = ["pointerdown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, touchActivity, { passive: true });
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        touchActivity();
        void checkTimeout();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      void checkTimeout();
    }, 60_000);

    if (isSupabaseConfigured) {
      void supabase.auth.getSession().then(({ data }) => {
        const userId = data.session?.user?.id;
        if (userId) {
          const storedUserId = window.localStorage.getItem(SESSION_USER_ID_KEY);
          if (storedUserId !== userId) {
            writeSessionTimestamps(userId);
          }
        }
      });
    }

    const {
      data: { subscription },
    } =
      isSupabaseConfigured
        ? supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          removeSessionTimestamps();
          return;
        }
        if (event === "SIGNED_IN" && session?.user?.id) {
          writeSessionTimestamps(session.user.id);
        }
        })
        : { data: { subscription: null } };

    void checkTimeout();

    return () => {
      active = false;
      window.clearInterval(intervalId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, touchActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      subscription?.unsubscribe();
    };
  }, [isAuthPage, router]);

  useEffect(() => {
    if (checkingSession || isAuthPage || typeof window === "undefined") return;

    const prefetch = () => {
      for (const route of PREFETCH_ROUTES) {
        if (route !== pathname) {
          router.prefetch(route);
        }
      }
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(prefetch, 600);
    return () => window.clearTimeout(timeoutId);
  }, [checkingSession, isAuthPage, pathname, router]);

  // 3) Sidebar slide-in transition after login
  useEffect(() => {
    const shouldShowSidebar = !checkingSession && !isAuthPage;
    const timer = setTimeout(() => setSidebarVisible(shouldShowSidebar), shouldShowSidebar ? 50 : 0);
    return () => clearTimeout(timer);
  }, [checkingSession, isAuthPage]);

  // 4) Mejora PRO: toast + limpieza de URL para errores "soft"
  useEffect(() => {
    const error = searchParams.get("error");
    const tenant = searchParams.get("tenant");

    if (!error) return;

    const errorKey = ERROR_KEYS[error];
    if (!errorKey) return;
    const msg = t(errorKey);

    const toastKey = `${pathname}|${error}|${tenant ?? ""}`;
    if (lastToastKeyRef.current === toastKey) return;
    lastToastKeyRef.current = toastKey;

    // Toast PRO (no invasivo)
    toast.error(msg, { duration: 5000 });

    // Limpieza de URL: borramos solo los params que usamos para el aviso
    const params = new URLSearchParams(searchParams.toString());
    params.delete("error");
    params.delete("tenant");

    const cleanUrl = buildCleanUrl(pathname, params);

    // No rompemos navegación, no recargamos todo
    router.replace(cleanUrl);
  }, [pathname, searchParams, router, t]);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#05070b] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-white/20 border-t-[#ccff00] animate-spin" />
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-white/60">
            Cargando DEMO
          </p>
        </div>
      </div>
    );
  }

  // Auth pages: render clean, no sidebar
  if (isAuthPage) {
    return (
      <>
        <Toaster position="top-right" />
        {children}
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" />

      <div className="min-h-screen flex bg-[#05070b]">
        {/* SIDEBAR DESKTOP — slide-in from left */}
        <div
          className="hidden md:flex md:h-screen md:sticky md:top-0 transition-transform duration-500 ease-out"
          style={{ transform: sidebarVisible ? "translateX(0)" : "translateX(-100%)" }}
        >
          <Sidebar />
        </div>

        {/* COLUMNA PRINCIPAL */}
        <div className="flex-1 flex flex-col">
          {/* HEADER MOBILE */}
          <header className="md:hidden fixed inset-x-0 top-0 z-[70] flex items-center justify-center px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-[#05070b]/95 backdrop-blur border-b border-gray-800 shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <div className="rounded-md border border-white/25 bg-black/30 px-1 py-1">
                <LanguageSelector />
              </div>
            </div>

            <div className="text-center">
              <Image
                src="/logo.svg"
                alt="PADELX DEMO"
                width={126}
                height={42}
                priority
                className="h-7 w-auto mx-auto object-contain"
              />
            </div>

            <button
              type="button"
              aria-label={mobileOpen ? t("shell.closeMenu") : t("shell.openMenu")}
              data-testid="mobile-menu-toggle"
              className="absolute right-4 inline-flex items-center gap-2 rounded-md border border-white/40 bg-black/30 px-3 py-2 shadow-sm hover:bg-black/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#05070b] focus:ring-[#ccff00]"
              style={{ color: "#ffffff" }}
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? (
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
              <span className="text-xs font-semibold">{mobileOpen ? t("shell.close") : t("shell.menu")}</span>
            </button>
          </header>

          {/* CONTENIDO */}
          <div className="flex-1 bg-gray-50 pt-[88px] md:pt-0">{children}</div>
        </div>

        {/* OVERLAY MOBILE — slide-in transition */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div
              className="absolute inset-y-0 left-0 w-64 max-w-[80%] overflow-y-auto overscroll-contain animate-slide-in-left"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <Sidebar onLinkClick={() => setMobileOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
