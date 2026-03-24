// Edge Function: admin-manage-pet
// Handles INSERT / UPDATE / DELETE on the pets table.
// Requires a valid admin JWT — role is verified against user_roles before any write.
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

    // 1. Validate the caller's JWT
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

    // 2. Confirm caller has admin role
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || roleData?.role !== 'admin') {
      console.warn(`[ADMIN_MANAGE_PET] Forbidden: user=${user.id} role=${roleData?.role}`);
      return new Response(
        JSON.stringify({ ok: false, error: 'Forbidden: admin role required' }),
        { status: 403, headers: cors },
      );
    }

    // 3. Parse request body
    const { action, pet_id, payload } = await req.json();
    console.log(`[ADMIN_MANAGE_PET] action=${action} pet_id=${pet_id ?? 'n/a'} user=${user.id}`);

    // ── CREATE ──────────────────────────────────────────────────────────────
    if (action === 'create') {
      if (!payload) {
        return new Response(
          JSON.stringify({ ok: false, error: 'payload is required for create' }),
          { status: 400, headers: cors },
        );
      }
      const { data, error } = await adminClient
        .from('pets')
        .insert(payload)
        .select()
        .single();
      if (error) {
        console.error('[ADMIN_MANAGE_PET] insert error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }
      return new Response(JSON.stringify({ ok: true, data }), { headers: cors });
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    if (action === 'update') {
      if (!pet_id || !payload) {
        return new Response(
          JSON.stringify({ ok: false, error: 'pet_id and payload are required for update' }),
          { status: 400, headers: cors },
        );
      }
      const { data, error } = await adminClient
        .from('pets')
        .update(payload)
        .eq('id', pet_id)
        .select();
      if (error) {
        console.error('[ADMIN_MANAGE_PET] update error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }
      return new Response(JSON.stringify({ ok: true, data }), { headers: cors });
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!pet_id) {
        return new Response(
          JSON.stringify({ ok: false, error: 'pet_id is required for delete' }),
          { status: 400, headers: cors },
        );
      }
      const { error } = await adminClient
        .from('pets')
        .delete()
        .eq('id', pet_id);
      if (error) {
        console.error('[ADMIN_MANAGE_PET] delete error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // Unknown action
    return new Response(
      JSON.stringify({ ok: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: cors },
    );

  } catch (e) {
    console.error('[ADMIN_MANAGE_PET] unexpected error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: cors },
    );
  }
});
