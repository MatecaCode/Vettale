// Edge Function: admin-manage-availability
// Handles all staff_availability + staff_profiles reads/writes for admin.
// Requires a valid admin JWT — role is verified against user_roles before any operation.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Generate 10-minute slots from 9:00 to end hour (exclusive) for a single date string.
function generateSlotsForDay(
  staffProfileId: string,
  dateStr: string,
  endHour: number,
): { staff_profile_id: string; date: string; time_slot: string; available: boolean }[] {
  const slots = [];
  for (let hour = 9; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += 10) {
      slots.push({
        staff_profile_id: staffProfileId,
        date: dateStr,
        time_slot: `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`,
        available: true,
      });
    }
  }
  return slots;
}

// Format a Date as yyyy-MM-dd without timezone shifts.
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      console.warn(`[ADMIN_MANAGE_AVAILABILITY] Forbidden: user=${user.id} role=${roleData?.role}`);
      return new Response(
        JSON.stringify({ ok: false, error: 'Forbidden: admin role required' }),
        { status: 403, headers: cors },
      );
    }

    // 3. Parse request body
    const body = await req.json();
    const { action } = body;
    console.log(`[ADMIN_MANAGE_AVAILABILITY] action=${action} user=${user.id}`);

    // ── GET_STAFF ────────────────────────────────────────────────────────────
    // Returns active staff profiles for the availability manager UI.
    if (action === 'get_staff') {
      const { data, error } = await adminClient
        .from('staff_profiles')
        .select('id, name, can_bathe, can_groom, can_vet, active')
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('[ADMIN_MANAGE_AVAILABILITY] get_staff error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }
      return new Response(JSON.stringify({ ok: true, data }), { headers: cors });
    }

    // ── GET_AVAILABILITY ─────────────────────────────────────────────────────
    // Returns all availability slots for a given date, joined with staff name.
    if (action === 'get_availability') {
      const { date } = body;
      if (!date) {
        return new Response(
          JSON.stringify({ ok: false, error: 'date is required for get_availability' }),
          { status: 400, headers: cors },
        );
      }

      const { data, error } = await adminClient
        .from('staff_availability')
        .select(`
          id,
          staff_profile_id,
          date,
          time_slot,
          available,
          staff_profiles!inner(name)
        `)
        .eq('date', date)
        .order('time_slot');

      if (error) {
        console.error('[ADMIN_MANAGE_AVAILABILITY] get_availability error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }

      // Flatten staff_profiles join so client gets a flat staff_name field
      const slots = (data || []).map((slot: any) => ({
        id: slot.id,
        staff_profile_id: slot.staff_profile_id,
        date: slot.date,
        time_slot: slot.time_slot,
        available: slot.available,
        staff_name: slot.staff_profiles?.name ?? 'Unknown',
      }));

      return new Response(JSON.stringify({ ok: true, data: slots }), { headers: cors });
    }

    // ── UPDATE_SLOTS ─────────────────────────────────────────────────────────
    // Updates availability for a set of time_slots on a given staff + date.
    // Used for: anchor toggle, mark-day-available, mark-day-unavailable.
    if (action === 'update_slots') {
      const { staff_profile_id, date, time_slots, available } = body;
      if (!staff_profile_id || !date || !Array.isArray(time_slots) || typeof available !== 'boolean') {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'staff_profile_id, date, time_slots (array), and available (boolean) are required',
          }),
          { status: 400, headers: cors },
        );
      }

      const { data, error } = await adminClient
        .from('staff_availability')
        .update({ available })
        .eq('staff_profile_id', staff_profile_id)
        .eq('date', date)
        .in('time_slot', time_slots)
        .select('id');

      if (error) {
        console.error('[ADMIN_MANAGE_AVAILABILITY] update_slots error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }

      return new Response(
        JSON.stringify({ ok: true, affected: data?.length ?? 0 }),
        { headers: cors },
      );
    }

    // ── UPDATE_SLOT_BY_ID ────────────────────────────────────────────────────
    // Updates a single availability slot by its primary key.
    if (action === 'update_slot_by_id') {
      const { slot_id, available } = body;
      if (!slot_id || typeof available !== 'boolean') {
        return new Response(
          JSON.stringify({ ok: false, error: 'slot_id and available (boolean) are required' }),
          { status: 400, headers: cors },
        );
      }

      const { error } = await adminClient
        .from('staff_availability')
        .update({ available })
        .eq('id', slot_id);

      if (error) {
        console.error('[ADMIN_MANAGE_AVAILABILITY] update_slot_by_id error:', error);
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: cors },
        );
      }

      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // ── GENERATE_AVAILABILITY ─────────────────────────────────────────────────
    // Generates 30 days of availability slots server-side and upserts them.
    // Skips Sundays; Saturdays end at 12:00; weekdays end at 17:00.
    if (action === 'generate_availability') {
      const { staff_profile_id } = body;
      if (!staff_profile_id) {
        return new Response(
          JSON.stringify({ ok: false, error: 'staff_profile_id is required for generate_availability' }),
          { status: 400, headers: cors },
        );
      }

      const allSlots: { staff_profile_id: string; date: string; time_slot: string; available: boolean }[] = [];
      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      for (const d = new Date(now); d <= thirtyDaysLater; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay(); // 0=Sun
        if (dow === 0) continue; // skip Sundays
        const endHour = dow === 6 ? 12 : 17; // Saturdays end at 12:00
        allSlots.push(...generateSlotsForDay(staff_profile_id, toDateStr(d), endHour));
      }

      // Upsert in batches of 500
      const BATCH = 500;
      let totalInserted = 0;
      for (let i = 0; i < allSlots.length; i += BATCH) {
        const batch = allSlots.slice(i, i + BATCH);
        const { error: batchError } = await adminClient
          .from('staff_availability')
          .upsert(batch, { onConflict: 'staff_profile_id,date,time_slot' });

        if (batchError) {
          console.error(`[ADMIN_MANAGE_AVAILABILITY] generate batch error (i=${i}):`, batchError);
          return new Response(
            JSON.stringify({ ok: false, error: batchError.message }),
            { status: 400, headers: cors },
          );
        }
        totalInserted += batch.length;
      }

      console.log(`[ADMIN_MANAGE_AVAILABILITY] generated ${totalInserted} slots for staff=${staff_profile_id}`);
      return new Response(
        JSON.stringify({ ok: true, slots_generated: totalInserted }),
        { headers: cors },
      );
    }

    // Unknown action
    return new Response(
      JSON.stringify({ ok: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: cors },
    );

  } catch (e) {
    console.error('[ADMIN_MANAGE_AVAILABILITY] unexpected error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: cors },
    );
  }
});
