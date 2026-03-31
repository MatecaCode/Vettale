// Deno Edge Function - Staff Setup (Reset Password)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders as getCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(origin) });

  try {
    const { email, staff_profile_id, name } = await req.json();
    if (!email || !staff_profile_id) {
      return new Response(JSON.stringify({ ok: false, error: 'email and staff_profile_id are required' }),
        { status: 400, headers: getCors(origin) });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) ensure user exists (ignore conflict)
    await admin.auth.admin.createUser({ email, email_confirm: false }).catch(() => {});

    // 2) send Supabase Reset Password email
    const redirectTo = Deno.env.get('STAFF_CLAIM_REDIRECT') ?? 'https://vettale.shop/staff/claim';
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetErr) {
      console.error('[STAFF_SETUP] resetPasswordForEmail:', resetErr);
      return new Response(JSON.stringify({ ok: false, error: resetErr.message }), { status: 400, headers: getCors(origin) });
    }

    // 3) stamp
    await admin.from('staff_profiles')
      .update({ claim_invited_at: new Date().toISOString(), email })
      .eq('id', staff_profile_id);

    return new Response(JSON.stringify({ ok: true, kind: 'reset_password', redirectTo }), { headers: getCors(origin) });
  } catch (e) {
    console.error('[STAFF_SETUP] unexpected:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: getCors(origin) });
  }
});
