export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CreatePlayerBody = {
  name?: unknown;
  email?: unknown;
  level?: unknown;
  avatar_url?: unknown;
};

type Profile = {
  role: string | null;
  active: boolean | null;
  tenant_id: string | null;
};

const ALLOWED_ROLES = new Set(["admin", "manager", "super_admin"]);

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Servidor mal configurado." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, active, tenant_id")
      .eq("id", user.id)
      .single<Profile>();

    if (profileError || !profile || profile.active !== true) {
      return NextResponse.json({ error: "No se pudo validar el perfil del usuario." }, { status: 403 });
    }

    const role = String(profile.role || "").toLowerCase();
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json(
        { error: "Solo un admin o manager puede crear jugadores." },
        { status: 403 }
      );
    }

    if (!profile.tenant_id) {
      return NextResponse.json(
        { error: "Tu usuario no tiene club asignado." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as CreatePlayerBody;
    const name = readString(body.name);
    const email = readString(body.email);
    const avatarUrl = readString(body.avatar_url);
    const level = Number(body.level ?? 4);

    if (!name) {
      return NextResponse.json({ error: "Ingresá el nombre del jugador." }, { status: 400 });
    }

    if (!Number.isFinite(level) || level < 1 || level > 7) {
      return NextResponse.json({ error: "Nivel de jugador inválido." }, { status: 400 });
    }

    const { data: createdPlayer, error: insertError } = await adminClient
      .from("players")
      .insert({
        name,
        email: email || null,
        level,
        avatar_url: avatarUrl || null,
        is_approved: false,
        tenant_id: profile.tenant_id,
      })
      .select("id")
      .single();

    if (insertError) {
      const message = insertError.message?.includes("PLAN_LIMIT")
        ? insertError.message.replace("PLAN_LIMIT: ", "")
        : `Error al guardar el jugador: ${insertError.message}`;

      return NextResponse.json({ error: message }, { status: 400 });
    }

    // El query builder de Supabase es "thenable" pero no es Promise nativa:
    // no tiene .catch(). Encadenarlo tiraba "insert(...).catch is not a
    // function" DESPUÉS de guardar el jugador, y caía al catch general
    // devolviendo 500 aunque el alta sí había funcionado. El log es
    // best-effort: await + ignorar el error.
    const { error: logError } = await adminClient
      .from("action_logs")
      .insert({
        user_id: user.id,
        user_email: user.email,
        action: "CREATE_PLAYER",
        entity: "player",
        entity_id: createdPlayer?.id,
        tenant_id: profile.tenant_id,
        metadata: { playerName: name, source: "admin_create_player" },
      });
    if (logError) {
      console.warn("[players/create] action log warning", logError);
    }

    return NextResponse.json({ success: true, id: createdPlayer?.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
