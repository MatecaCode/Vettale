// Edge Function: admin-get-registration-status
// Post-registration verification: confirms that user_roles, admin_profiles,
// and admin_registration_codes were all correctly written after admin signup.
//
// Security model:
//   - Validates JWT to confirm the caller's identity (no role check —
//     the user is mid-registration and does not have the admin role yet).
//   - user_id is taken exclusively from the verified JWT, never from the body.
//   - All 3 sensitive table reads use the SERVICE_ROLE key server-side.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    //    user_id comes from here, never from the request body.
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

    // 2. Extract `code` from the request body.
    //    user_id is intentionally ignored from the body even if provided.
    const body = await req.json();
    const { code } = body;
    if (!code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({ ok: false, error: 'code is required' }),
        { status: 400, headers: cors },
      );
    }

    const userId = user.id;
    console.log(`[ADMIN_GET_REGISTRATION_STATUS] verifying userId=${userId}`);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 3a. Check user_roles — admin role must exist for this user.
    const { data: roles, error: rolesError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin');

    if (rolesError) {
      console.error('[ADMIN_GET_REGISTRATION_STATUS] user_roles query error:', rolesError);
      return new Response(
        JSON.stringify({ ok: true, verified: false, error: 'Erro ao verificar role de administrador' }),
        { headers: cors },
      );
    }
    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, verified: false, error: 'Role de administrador não foi atribuída' }),
        { headers: cors },
      );
    }

    // 3b. Check admin_profiles — profile must exist for this user.
    const { data: profile, error: profileError } = await adminClient
      .from('admin_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      console.error('[ADMIN_GET_REGISTRATION_STATUS] admin_profiles query error:', profileError);
      return new Response(
        JSON.stringify({ ok: true, verified: false, error: 'Perfil de administrador não foi criado' }),
        { headers: cors },
      );
    }

    // 3c. Check admin_registration_codes — code must be marked used by this user.
    const { data: codeRecord, error: codeError } = await adminClient
      .from('admin_registration_codes')
      .select('is_used, used_by')
      .eq('code', code)
      .single();

    if (codeError || !codeRecord) {
      console.error('[ADMIN_GET_REGISTRATION_STATUS] admin_registration_codes query error:', codeError);
      return new Response(
        JSON.stringify({ ok: true, verified: false, error: 'Código não encontrado' }),
        { headers: cors },
      );
    }
    if (!codeRecord.is_used || codeRecord.used_by !== userId) {
      return new Response(
        JSON.stringify({ ok: true, verified: false, error: 'Código não foi marcado como usado' }),
        { headers: cors },
      );
    }

    // All 3 checks passed.
    console.log(`[ADMIN_GET_REGISTRATION_STATUS] verified OK for userId=${userId}`);
    return new Response(
      JSON.stringify({ ok: true, verified: true }),
      { headers: cors },
    );

  } catch (e) {
    console.error('[ADMIN_GET_REGISTRATION_STATUS] unexpected error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: cors },
    );
  }
});
