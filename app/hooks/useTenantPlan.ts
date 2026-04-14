"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type PlanInfo = {
  id: string;
  name: string;
  slug: string;
  max_players: number;
  max_concurrent_tournaments: number;
  max_courts: number;
  has_advanced_rankings: boolean;
  has_player_stats: boolean;
  has_leagues: boolean;
  has_online_registration: boolean;
  has_api_access: boolean;
  has_mobile_app: boolean;
  has_live_scoring: boolean;
  has_white_label: boolean;
  has_integrations: boolean;
};

type TenantPlanResult = {
  loading: boolean;
  plan: PlanInfo | null;
  addonSlugs: string[];
  usage: {
    playerCount: number;
    activeTournamentCount: number;
  };
  canCreatePlayer: boolean;
  canCreateTournament: boolean;
  hasFeature: (key: string) => boolean;
};

type TenantPlanData = Pick<
  TenantPlanResult,
  "plan" | "addonSlugs" | "usage" | "canCreatePlayer" | "canCreateTournament"
>;

type TenantPlanCache = {
  userId: string;
  data: Omit<TenantPlanData, "canCreatePlayer" | "canCreateTournament">;
  expiresAt: number;
};

type TenantPlanJoin = {
  subscription_plans: PlanInfo | PlanInfo[] | null;
};

type TenantAddonJoin = {
  addons: { slug: string | null } | Array<{ slug: string | null }> | null;
};

const PLAN_BOOLEAN_KEYS = [
  "has_advanced_rankings",
  "has_player_stats",
  "has_leagues",
  "has_online_registration",
  "has_api_access",
  "has_mobile_app",
  "has_live_scoring",
  "has_white_label",
  "has_integrations",
] as const;

const TENANT_PLAN_CACHE_TTL_MS = 5 * 60 * 1000;

let tenantPlanCache: TenantPlanCache | null = null;
let tenantPlanLoadPromise: Promise<TenantPlanCache["data"]> | null = null;

function getJoinedSingle<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function buildResultData(
  plan: PlanInfo | null,
  addonSlugs: string[],
  usage: TenantPlanResult["usage"]
): TenantPlanCache["data"] {
  return { plan, addonSlugs, usage };
}

export function useTenantPlan(): TenantPlanResult {
  const cached = tenantPlanCache?.data ?? null;
  const [loading, setLoading] = useState(!cached);
  const [plan, setPlan] = useState<PlanInfo | null>(cached?.plan ?? null);
  const [addonSlugs, setAddonSlugs] = useState<string[]>(cached?.addonSlugs ?? []);
  const [usage, setUsage] = useState(
    cached?.usage ?? { playerCount: 0, activeTournamentCount: 0 }
  );

  useEffect(() => {
    let active = true;

    const resolveTenantPlan = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          tenantPlanCache = null;
          return buildResultData(null, [], { playerCount: 0, activeTournamentCount: 0 });
        }

        if (
          tenantPlanCache?.userId === session.user.id &&
          tenantPlanCache.expiresAt > Date.now()
        ) {
          return tenantPlanCache.data;
        }

        // 1) Get tenant_id from profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", session.user.id)
          .single();

        if (!profile?.tenant_id) {
          return buildResultData(null, [], { playerCount: 0, activeTournamentCount: 0 });
        }

        const tenantId = profile.tenant_id;

        // 2) Get tenant plan via join
        const { data: tenant } = await supabase
          .from("tenants")
          .select("subscription_plan_id, subscription_plans(*)")
          .eq("id", tenantId)
          .single();

        const planData = getJoinedSingle((tenant as TenantPlanJoin | null)?.subscription_plans);

        // 3) Get active addon slugs
        const { data: addonsData } = await supabase
          .from("tenant_addons")
          .select("addon_id, addons(slug)")
          .eq("tenant_id", tenantId);

        const slugs = ((addonsData || []) as TenantAddonJoin[])
          .map((ta) => getJoinedSingle(ta.addons)?.slug)
          .filter((slug): slug is string => Boolean(slug));

        // 4) Live counts
        const [playersRes, tournamentsRes] = await Promise.all([
          supabase
            .from("players")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId),
          supabase
            .from("tournaments")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["open", "ongoing"]),
        ]);

        const data = buildResultData(planData || null, slugs, {
          playerCount: playersRes.count || 0,
          activeTournamentCount: tournamentsRes.count || 0,
        });

        tenantPlanCache = {
          userId: session.user.id,
          data,
          expiresAt: Date.now() + TENANT_PLAN_CACHE_TTL_MS,
        };

        return data;
      } catch (err) {
        console.error("[useTenantPlan] error:", err);
        return buildResultData(null, [], { playerCount: 0, activeTournamentCount: 0 });
      }
    };

    const load = async () => {
      if (!tenantPlanLoadPromise) {
        tenantPlanLoadPromise = resolveTenantPlan().finally(() => {
          tenantPlanLoadPromise = null;
        });
      }

      const result = await tenantPlanLoadPromise;
      if (!active) return;

      setPlan(result.plan);
      setAddonSlugs(result.addonSlugs);
      setUsage(result.usage);
      setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const canCreatePlayer = !plan || usage.playerCount < plan.max_players;
  const canCreateTournament = !plan || usage.activeTournamentCount < plan.max_concurrent_tournaments;

  const hasFeature = (key: string): boolean => {
    // If no plan, allow everything (trial/no restrictions)
    if (!plan) return true;
    // Check plan boolean flags
    if (PLAN_BOOLEAN_KEYS.includes(key as (typeof PLAN_BOOLEAN_KEYS)[number])) {
      return Boolean(plan[key as (typeof PLAN_BOOLEAN_KEYS)[number]]);
    }
    // Check addon slugs
    return addonSlugs.includes(key);
  };

  return {
    loading,
    plan,
    addonSlugs,
    usage,
    canCreatePlayer,
    canCreateTournament,
    hasFeature,
  };
}
