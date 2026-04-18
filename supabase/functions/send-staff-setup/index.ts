import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED = new Set([
  'http://localhost:8080',
  'https://vettale.shop',
  'https://admin.vettale.com',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = ALLOWED.has(origin ?? '') ? (origin as string) : 'http://localhost:8080';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });

  try {
    const { email, staff_profile_id, name } = await req.json();
    if (!email || !staff_profile_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'email and staff_profile_id are required' }),
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1) Ensure user exists (ignore conflict)
    await admin.auth.admin.createUser({ email, email_confirm: false }).catch(() => {});

    // 2) Send password reset email
    const redirectTo = Deno.env.get('STAFF_CLAIM_REDIRECT') ?? 'https://vettale.shop/staff/claim';
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetErr) {
      console.error('[STAFF_SETUP] resetPasswordForEmail:', resetErr);
      return new Response(
        JSON.stringify({ ok: false, error: resetErr.message }),
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    // 3) Stamp invite timestamp
    await admin
      .from('staff_profiles')
      .update({ claim_invited_at: new Date().toISOString(), email })
      .eq('id', staff_profile_id);

    return new Response(
      JSON.stringify({ ok: true, kind: 'reset_password', redirectTo }),
      { headers: corsHeaders(origin) }
    );
  } catch (e) {
    console.error('[STAFF_SETUP] unexpected:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: corsHeaders(origin) }
    );
  }
});
