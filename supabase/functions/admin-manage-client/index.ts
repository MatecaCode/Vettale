// Edge Function: admin-manage-client
// Handles all client table operations for admins:
//   create, update, get_by_id, list
// Requires a valid admin JWT — role is verified against user_roles before any operation.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Full column list used for both get_by_id and list.
const CLIENT_COLUMNS = `
  id, user_id, name, phone, email, address, notes, location_id,
  created_at, updated_at, admin_created, created_by, claim_invited_at, claimed_at,
  needs_registration, is_whatsapp, preferred_channel,
  emergency_contact_name, emergency_contact_phone,
  preferred_staff_profile_id, accessibility_notes, general_notes,
  marketing_source_code, marketing_source_other, birth_date,
  locations:location_id (name)
`;

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
      console.warn(`[ADMIN_MANAGE_CLIENT] Forbidden: user=${user.id} role=${roleData?.role}`);
      return new Response(
        JSON.stringify({ ok: false, error: 'Forbidden: admin role required' }),
        { status: 403, headers: cors },
      );
    }

    // 3. Parse request body
    const body = await req.json();
    const { action, client_id, payload } = body;
    console.log(`[ADMIN_MANAGE_CLIENT] action=${action} client_id=${client_id ?? 'n/a'} user=${user.id}`);

    // ── CREATE ──────────────────────────────────────────────────────────────
    if (action === 'create') {
      if (!payload) {
        return new Response(
          JSON.stringify({ ok: false, error: 'payload is required for create' }),
          { status: 400, headers: cors },
        );
      }
      const { data, error } = await adminClient
        .from('clients')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[ADMIN_MANAGE_CLIENT] insert error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }
      return new Response(JSON.stringify({ ok: true, data }), { headers: cors });
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    if (action === 'update') {
      if (!client_id || !payload) {
        return new Response(
          JSON.stringify({ ok: false, error: 'client_id and payload are required for update' }),
          { status: 400, headers: cors },
        );
      }
      const { error } = await adminClient
        .from('clients')
        .update(payload)
        .eq('id', client_id);

      if (error) {
        console.error('[ADMIN_MANAGE_CLIENT] update error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // ── GET_BY_ID ────────────────────────────────────────────────────────────
    // Used by the deep-link highlight flow (?highlight=<clientId>).
    if (action === 'get_by_id') {
      if (!client_id) {
        return new Response(
          JSON.stringify({ ok: false, error: 'client_id is required for get_by_id' }),
          { status: 400, headers: cors },
        );
      }
      const { data, error } = await adminClient
        .from('clients')
        .select(CLIENT_COLUMNS)
        .eq('id', client_id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ ok: false, error: error?.message ?? 'Not found' }),
          { status: 404, headers: cors },
        );
      }
      return new Response(JSON.stringify({ ok: true, data }), { headers: cors });
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    // Paginated client list with optional search and location filter.
    // Filters to true clients only (admin-created with no user_id, OR user has 'client' role).
    // Returns pet_count per client via a single batch query (no N+1).
    if (action === 'list') {
      const pageNum: number = typeof body.page === 'number' ? body.page : 0;
      const pageSize: number = Math.min(typeof body.page_size === 'number' ? body.page_size : 50, 100);
      const search: string = (body.search ?? '').toString().trim();
      const locationFilter: string = (body.location_filter ?? 'all').toString();

      const from = pageNum * pageSize;
      const to = from + pageSize - 1;

      // Build main query
      let query = adminClient
        .from('clients')
        .select(CLIENT_COLUMNS, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (locationFilter !== 'all') {
        query = query.eq('location_id', locationFilter);
      }

      if (search) {
        const digits = search.replace(/\D/g, '');
        const orParts = [`name.ilike.%${search}%`, `email.ilike.%${search}%`];
        if (digits.length >= 3) orParts.push(`phone.ilike.%${digits}%`);
        query = query.or(orParts.join(','));
      }

      const [{ data: rawClients, error: clientsError, count }, { data: roleRows, error: rolesError }] =
        await Promise.all([
          query,
          // Fetch all user_ids that have the 'client' role for post-filter
          adminClient.from('user_roles').select('user_id').eq('role', 'client'),
        ]);

      if (clientsError) {
        console.error('[ADMIN_MANAGE_CLIENT] list query error:', clientsError);
        return new Response(
          JSON.stringify({ ok: false, error: clientsError.message }),
          { status: 400, headers: cors },
        );
      }

      // Filter to true clients: no user_id yet (admin-created stub) OR has client role
      let clients = rawClients ?? [];
      if (!rolesError && roleRows) {
        const clientRoleIds = new Set(roleRows.map((r: any) => r.user_id));
        clients = clients.filter((c: any) => !c.user_id || clientRoleIds.has(c.user_id));
      }

      // Batch pet counts — one query, not N
      const clientIds = clients.map((c: any) => c.id);
      let petCountMap: Record<string, number> = {};
      if (clientIds.length > 0) {
        const { data: petRows } = await adminClient
          .from('pets')
          .select('client_id')
          .in('client_id', clientIds);
        petCountMap = (petRows ?? []).reduce((acc: Record<string, number>, p: any) => {
          acc[p.client_id] = (acc[p.client_id] ?? 0) + 1;
          return acc;
        }, {});
      }

      const result = clients.map((c: any) => ({
        ...c,
        location_name: c.locations?.name ?? null,
        pet_count: petCountMap[c.id] ?? 0,
      }));

      return new Response(
        JSON.stringify({ ok: true, data: result, total_count: count ?? null }),
        { headers: cors },
      );
    }

    // Unknown action
    return new Response(
      JSON.stringify({ ok: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: cors },
    );

  } catch (e) {
    console.error('[ADMIN_MANAGE_CLIENT] unexpected error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: cors },
    );
  }
});
