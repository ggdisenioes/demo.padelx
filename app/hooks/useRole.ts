"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";

export type UserRole = "admin" | "manager" | "super_admin" | "user";

type TokenClaims = {
  // Compatibilidad: hay proyectos que usan role/active y otros user_role/user_active
  role?: string;
  active?: boolean;
  user_role?: string;
  user_active?: boolean;
  app_metadata?: {
    role?: string;
    active?: boolean;
    user_role?: string;
    user_active?: boolean;
  };
};

const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;

type RoleCache = {
  userId: string;
  role: UserRole;
  expiresAt: number;
};

let roleCache: RoleCache | null = null;
let roleLoadPromise: Promise<UserRole> | null = null;

function getCachedRole() {
  if (!roleCache || roleCache.expiresAt <= Date.now()) return null;
  return roleCache.role;
}

function setCachedRole(userId: string, role: UserRole) {
  roleCache = {
    userId,
    role,
    expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
  };
}

export function clearRoleCache() {
  roleCache = null;
  roleLoadPromise = null;
}

function decodeJwtPayload<T = unknown>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);

    const json = atob(padded);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "admin" || normalized === "manager" || normalized === "user") {
    return normalized as UserRole;
  }
  if (normalized === "super_admin" || normalized === "super-admin" || normalized === "superadmin") {
    return "super_admin";
  }
  return null;
}

async function resolveRole(): Promise<UserRole> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    clearRoleCache();
    return "user";
  }

  const token = session.access_token;
  const claims = token ? decodeJwtPayload<TokenClaims>(token) : null;
  const roleFromToken =
    claims?.role ??
    claims?.user_role ??
    claims?.app_metadata?.role ??
    claims?.app_metadata?.user_role;

  const activeFromToken =
    claims?.active ??
    claims?.user_active ??
    claims?.app_metadata?.active ??
    claims?.app_metadata?.user_active;

  if (activeFromToken === false) {
    console.warn("[useRole] inactive user (JWT claim), signing out", session.user.id);
    toast.error("Tu cuenta fue desactivada. Contacta al administrador.");
    clearRoleCache();
    await supabase.auth.signOut();
    try {
      sessionStorage.setItem("auth_disabled", "1");
    } catch {}
    if (typeof window !== "undefined") {
      window.location.href = "/login?disabled=1";
    }
    return "user";
  }

  const normalizedTokenRole = normalizeRole(roleFromToken);
  if (normalizedTokenRole && normalizedTokenRole !== "user") {
    setCachedRole(session.user.id, normalizedTokenRole);
    return normalizedTokenRole;
  }

  if (roleCache?.userId === session.user.id && roleCache.expiresAt > Date.now()) {
    return roleCache.role;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", session.user.id)
    .single();

  if (error || !data) {
    console.warn("[useRole] failed to fetch role from profiles", error);
    const fallback = normalizedTokenRole || "user";
    setCachedRole(session.user.id, fallback);
    return fallback;
  }

  if (data.active === false) {
    console.warn("[useRole] inactive user, signing out", session.user.id);
    toast.error("Tu cuenta fue desactivada. Contacta al administrador.");
    clearRoleCache();
    await supabase.auth.signOut();
    try {
      sessionStorage.setItem("auth_disabled", "1");
    } catch {}
    if (typeof window !== "undefined") {
      window.location.href = "/login?disabled=1";
    }
    return "user";
  }

  const normalizedDbRole = normalizeRole(data.role);
  if (!normalizedDbRole) {
    console.warn("[useRole] invalid role value", data.role);
  }

  const resolvedRole = normalizedDbRole || normalizedTokenRole || "user";
  setCachedRole(session.user.id, resolvedRole);
  return resolvedRole;
}

function loadRoleOnce() {
  if (!roleLoadPromise) {
    roleLoadPromise = resolveRole().finally(() => {
      roleLoadPromise = null;
    });
  }
  return roleLoadPromise;
}

export function useRole() {
  const cachedRole = getCachedRole();
  const [role, setRole] = useState<UserRole>(cachedRole || "user");
  const [loading, setLoading] = useState(!cachedRole);

  useEffect(() => {
    let active = true;

    const loadRole = async () => {
      try {
        const resolvedRole = await loadRoleOnce();
        if (active) setRole(resolvedRole);
      } catch (err) {
        console.error("[useRole] unexpected error:", err);
        if (active) setRole("user");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRole();

    return () => {
      active = false;
    };
  }, []);

  return {
    role,
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
    isManager: role === "manager",
    isUser: role === "user",
    loading,
  };
}
