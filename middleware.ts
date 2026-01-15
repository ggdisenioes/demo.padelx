// middleware.ts
// IMPORTANT:
// - Este middleware corre en runtime Edge/Proxy.
// - NO se deben importar dependencias que usen Node APIs (fs, path, __dirname, etc.)
//   porque provocan 500 (MIDDLEWARE_INVOCATION_FAILED) en Vercel.
// - El rate limiting se debe aplicar en los handlers `app/api/**/route.ts` (Node runtime)
//   o con WAF/Firewall, no acá.

import { NextRequest, NextResponse } from "next/server";

function isPublicPath(pathname: string) {
  return (
    // auth/callbacks
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    // Next assets
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    // public
    pathname.startsWith("/public")
  );
}

export async function middleware(req: NextRequest) {
  try {
    const pathname = req.nextUrl.pathname;

    // Dejar pasar assets y rutas públicas
    if (isPublicPath(pathname)) {
      return NextResponse.next();
    }

    // NO bloqueamos páginas /admin acá para evitar loops por sesiones/cookies.
    // La protección real se hace en:
    // - UI: chequeo de rol/estado
    // - API: validación server-side + service role + RLS
    if (pathname.startsWith("/admin")) {
      return NextResponse.next();
    }

    // NO bloqueamos APIs acá: cada route handler valida auth/rol y la DB aplica RLS.
    if (pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    return NextResponse.next();
  } catch (err) {
    // Fail-open para evitar tumbar el sitio por errores del middleware.
    // Registramos el error para que aparezca en Vercel Logs.
    console.error("MIDDLEWARE_FATAL:", err);
    return NextResponse.next();
  }
}

export const config = {
  // Excluimos assets pesados. El resto pasa por el middleware.
  matcher: ["/((?!_next/static|_next/image).*)"],
};