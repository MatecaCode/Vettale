// Edge Function: get-current-user-context
// Provides two actions for Navigation and useAuth:
//
//   (default / 'get_context')
//     Returns { name, role, roles, photo_url } for the calling user.
//     - roles: full array from user_roles (useAuth needs all, not just primary)
//     - role:  primary role (admin > staff > groomer > vet > client)
//     - name:  user_roles.name → clients.name fallback
//     - photo_url: staff_profiles.photo_url (only when role = 'staff')
//
//   'ensure_client'
//     Guarantees a clients row exists for the calling user.
//     Creates one if absent using metadata from the verified JWT.
//     Returns { created: boolean }.
//
// Security model:
//   - Validates JWT for identity (no role check — any authenticated user).
//   - user_id and user metadata come exclusively from the verified JWT.
//   - All DB reads/writes use the SERVICE_ROLE key server-side.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Primary role priority order (highest first).
const ROLE_PRIORITY = ['admin', 'staff', 'groomer', 'vet', 'client'];

function primaryRole(roles: string[]): string {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return roles[0] ?? '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing Authorization header' }),
        { status: 401, headers: cors },
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Validate JWT — identity only, no role check.
    //    user_id and metadata come exclusively from here.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized' }),
        { status: 401, headers: cors },
      );
    }

    const userId = user.id;
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 2. Parse optional action from body (defaults to 'get_context').
    let action = 'get_context';
    try {
      const body = await req.json();
      if (body?.action) action = body.action;
    } catch { /* no body / invalid JSON — use default */ }

    // ── ENSURE_CLIENT ────────────────────────────────────────────────────────
    // Guarantees a clients row exists for this user, creating one if absent.
    if (action === 'ensure_client') {
      const { data: existing } = await adminClient
        .from('clients')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ ok: true, created: false }),
          { headers: cors },
        );
      }

      // Build the new row from JWT-sourced metadata — nothing from the request body.
      const displayName = (user.user_metadata?.name ?? '').toString() || null;
      const email = user.email ?? null;

      const { error: insertError } = await adminClient
        .from('clients')
        .insert({
          user_id: userId,
          name: displayName,
          email,
          admin_created: false,
        });

      // Ignore duplicate-key errors (race condition on concurrent logins).
      if (insertError && (insertError as any).code !== '23505') {
        console.warn('[GET_CURRENT_USER_CONTEXT] ensure_client insert failed:', insertError);
        return new Response(
          JSON.stringify({ ok: true, created: false }),
          { headers: cors },
        );
      }

      console.log(`[GET_CURRENT_USER_CONTEXT] ensure_client: created row for userId=${userId}`);
      return new Response(
        JSON.stringify({ ok: true, created: true }),
        { headers: cors },
      );
    }

    // ── GET_CONTEXT (default) ────────────────────────────────────────────────
    // Fetch ALL user_roles rows so useAuth can populate its full roles array.
    const { data: roleRows } = await adminClient
      .from('user_roles')
      .select('role, name')
      .eq('user_id', userId);

    const roles: string[] = (roleRows ?? []).map((r: any) => r.role as string);
    const primary = primaryRole(roles);

    // Name: prefer any non-empty name from role rows.
    let name = ((roleRows ?? []).map((r: any) => (r.name ?? '').toString().trim()).find(Boolean)) ?? '';

    // Fallback: if no name in user_roles, try clients.name.
    if (!name) {
      const { data: clientRow } = await adminClient
        .from('clients')
        .select('name')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      name = (clientRow?.name ?? '').toString().trim();
    }

    // Staff photo: only query staff_profiles when role is 'staff'.
    let photo_url: string | null = null;
    if (primary === 'staff') {
      const { data: staffRow } = await adminClient
        .from('staff_profiles')
        .select('photo_url')
        .eq('user_id', userId)
        .maybeSingle();
      photo_url = staffRow?.photo_url ?? null;
    }

    console.log(`[GET_CURRENT_USER_CONTEXT] userId=${userId} roles=${roles.join(',')||'(none)'} hasName=${!!name} hasPhoto=${!!photo_url}`);

    return new Response(
      JSON.stringify({ ok: true, data: { name, role: primary, roles, photo_url } }),
      { headers: cors },
    );

  } catch (e) {
    console.error('[GET_CURRENT_USER_CONTEXT] unexpected error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: cors },
    );
  }
});
