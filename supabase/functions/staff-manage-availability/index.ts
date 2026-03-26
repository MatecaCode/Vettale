// Edge Function: staff-manage-availability
// Handles staff availability reads and writes for staff-facing pages.
// Accessible by users with role 'staff' OR 'admin'.
// Staff: can only read/write their OWN availability (staff_profile_id derived from JWT).
// Admin: can pass an explicit staff_profile_id to manage any staff member.
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

    // 2. Check caller has 'staff' or 'admin' role
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const callerRole = roleData?.role;
    if (roleError || (callerRole !== 'staff' && callerRole !== 'admin')) {
      console.warn(`[STAFF_MANAGE_AVAILABILITY] Forbidden: user=${user.id} role=${callerRole}`);
      return new Response(
        JSON.stringify({ ok: false, error: 'Forbidden: staff or admin role required' }),
        { status: 403, headers: cors },
      );
    }

    // 3. Resolve staff_profile_id
    //    - Staff: always derived from JWT (cannot be overridden)
    //    - Admin: may pass explicit staff_profile_id in body; falls back to own profile
    const body = await req.json();
    const { action, date, slots } = body;

    let staffProfileId: string;

    if (callerRole === 'admin' && body.staff_profile_id) {
      // Admin managing a specific staff member
      staffProfileId = body.staff_profile_id;
    } else {
      // Staff managing own availability (or admin managing their own)
      const { data: profileData, error: profileError } = await adminClient
        .from('staff_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (profileError || !profileData) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Staff profile not found for this user' }),
          { status: 404, headers: cors },
        );
      }
      staffProfileId = profileData.id;
    }

    console.log(`[STAFF_MANAGE_AVAILABILITY] action=${action} staff_profile_id=${staffProfileId} user=${user.id} role=${callerRole}`);

    // ── GET_AVAILABILITY ─────────────────────────────────────────────────────
    // Returns all time_slot rows for a given date and staff_profile_id.
    if (action === 'get_availability') {
      if (!date) {
        return new Response(
          JSON.stringify({ ok: false, error: 'date is required for get_availability' }),
          { status: 400, headers: cors },
        );
      }

      const { data, error } = await adminClient
        .from('staff_availability')
        .select('time_slot, available')
        .eq('staff_profile_id', staffProfileId)
        .eq('date', date);

      if (error) {
        console.error('[STAFF_MANAGE_AVAILABILITY] get_availability error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }

      return new Response(JSON.stringify({ ok: true, data: data ?? [] }), { headers: cors });
    }

    // ── UPDATE_SLOTS ─────────────────────────────────────────────────────────
    // UPDATE existing rows (assumes rows already exist — used by StaffCalendar).
    // Body: { date, slots: [{ time_slot, available }] }
    if (action === 'update_slots') {
      if (!date || !Array.isArray(slots) || slots.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: 'date and slots[] are required for update_slots' }),
          { status: 400, headers: cors },
        );
      }

      const updatePromises = slots.map((slot: { time_slot: string; available: boolean }) =>
        adminClient
          .from('staff_availability')
          .update({ available: slot.available })
          .eq('staff_profile_id', staffProfileId)
          .eq('date', date)
          .eq('time_slot', slot.time_slot)
      );

      const results = await Promise.all(updatePromises);
      const firstError = results.find(r => r.error);
      if (firstError?.error) {
        console.error('[STAFF_MANAGE_AVAILABILITY] update_slots error:', firstError.error);
        return new Response(
          JSON.stringify({ ok: false, error: firstError.error.message }),
          { status: 400, headers: cors },
        );
      }

      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // ── UPSERT_SLOTS ─────────────────────────────────────────────────────────
    // UPSERT rows — creates if missing, updates if exists (used by StaffAvailability).
    // Body: { date, slots: [{ time_slot, available }] }
    if (action === 'upsert_slots') {
      if (!date || !Array.isArray(slots) || slots.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: 'date and slots[] are required for upsert_slots' }),
          { status: 400, headers: cors },
        );
      }

      const rows = slots.map((slot: { time_slot: string; available: boolean }) => ({
        staff_profile_id: staffProfileId,
        date,
        time_slot: slot.time_slot,
        available: slot.available,
      }));

      const { error } = await adminClient
        .from('staff_availability')
        .upsert(rows, { onConflict: 'staff_profile_id,date,time_slot' });

      if (error) {
        console.error('[STAFF_MANAGE_AVAILABILITY] upsert_slots error:', error);
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
    console.error('[STAFF_MANAGE_AVAILABILITY] unexpected error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: cors },
    );
  }
});
