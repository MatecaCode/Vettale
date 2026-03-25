// Edge Function: admin-get-dashboard-stats
// Runs all 8 AdminDashboard stat queries server-side in parallel.
// Requires a valid admin JWT — role is verified before any query.
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

    // 1. Validate JWT
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

    // 2. Confirm admin role
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || roleData?.role !== 'admin') {
      console.warn(`[ADMIN_GET_DASHBOARD_STATS] Forbidden: user=${user.id} role=${roleData?.role}`);
      return new Response(
        JSON.stringify({ ok: false, error: 'Forbidden: admin role required' }),
        { status: 403, headers: cors },
      );
    }

    // 3. Run all stat queries in parallel.
    //    "today" matches the client-side logic: UTC date string yyyy-MM-dd.
    const today = new Date().toISOString().split('T')[0];

    const [
      { count: totalUsers },
      { count: totalPets },
      { count: totalBookings },
      { count: todayServices },
      { count: pendingApprovals },
      { data: staffWithAppointments },
      { data: todayAppointments },
      { count: pendingCancellations },
    ] = await Promise.all([
      // Total registered users
      adminClient
        .from('user_roles')
        .select('*', { count: 'exact', head: true }),

      // Total pets
      adminClient
        .from('pets')
        .select('*', { count: 'exact', head: true }),

      // Total appointments ever
      adminClient
        .from('appointments')
        .select('*', { count: 'exact', head: true }),

      // Today's appointments (excluding cancelled)
      adminClient
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('date', today)
        .neq('status', 'cancelled'),

      // Pending approvals
      adminClient
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),

      // Staff on duty today (distinct staff_profile_id with non-cancelled appointments)
      adminClient
        .from('appointment_staff')
        .select('staff_profile_id, appointments!inner(date, status)')
        .eq('appointments.date', today)
        .neq('appointments.status', 'cancelled'),

      // Revenue today (sum of total_price for confirmed appointments)
      adminClient
        .from('appointments')
        .select('total_price')
        .eq('date', today)
        .eq('status', 'confirmed'),

      // Pending cancellations
      adminClient
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'cancelled'),
    ]);

    const staffOnDuty = new Set(
      (staffWithAppointments ?? []).map((r: any) => r.staff_profile_id),
    ).size;

    const revenueToday = (todayAppointments ?? []).reduce(
      (sum: number, apt: any) => sum + (apt.total_price || 0),
      0,
    );

    console.log(`[ADMIN_GET_DASHBOARD_STATS] stats fetched for user=${user.id} today=${today}`);

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          totalUsers: totalUsers ?? 0,
          totalPets: totalPets ?? 0,
          totalBookings: totalBookings ?? 0,
          todayServices: todayServices ?? 0,
          pendingApprovals: pendingApprovals ?? 0,
          staffOnDuty,
          revenueToday,
          pendingCancellations: pendingCancellations ?? 0,
        },
      }),
      { headers: cors },
    );

  } catch (e) {
    console.error('[ADMIN_GET_DASHBOARD_STATS] unexpected error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: cors },
    );
  }
});
