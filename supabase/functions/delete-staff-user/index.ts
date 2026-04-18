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

async function requireAdmin(
  req: Request,
  admin: ReturnType<typeof createClient>,
  origin: string | null
): Promise<{ user: { id: string } } | { error: Response }> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  if (!token) {
    return {
      error: new Response(
        JSON.stringify({ ok: false, error: 'Missing authorization token' }),
        { status: 401, headers: corsHeaders(origin) }
      ),
    };
  }

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    return {
      error: new Response(
        JSON.stringify({ ok: false, error: 'Invalid or expired token' }),
        { status: 401, headers: corsHeaders(origin) }
      ),
    };
  }

  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleRow) {
    return {
      error: new Response(
        JSON.stringify({ ok: false, error: 'Forbidden: admin role required' }),
        { status: 403, headers: corsHeaders(origin) }
      ),
    };
  }

  return { user: { id: user.id } };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const authResult = await requireAdmin(req, supabaseAdmin, origin);
  if ('error' in authResult) return authResult.error;

  try {
    const { user_id, email, staff_profile_id } = await req.json();
    console.log('[DELETE_STAFF_USER] Request:', { user_id, email, staff_profile_id });

    if (!user_id && !email) {
      return new Response(
        JSON.stringify({ ok: false, error: 'user_id or email is required' }),
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    let userIdToDelete = user_id;

    if (!userIdToDelete && email) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
      if (userError) {
        console.error('[DELETE_STAFF_USER] Error listing users:', userError);
        return new Response(
          JSON.stringify({ ok: false, error: 'Failed to find user by email' }),
          { status: 400, headers: corsHeaders(origin) }
        );
      }
      const found = userData.users.find(u => u.email === email);
      if (found) {
        userIdToDelete = found.id;
        console.log('[DELETE_STAFF_USER] Found user by email:', userIdToDelete);
      } else {
        console.log('[DELETE_STAFF_USER] No auth user found for email:', email);
        return new Response(
          JSON.stringify({ ok: true, message: 'No auth user found to delete' }),
          { headers: corsHeaders(origin) }
        );
      }
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userIdToDelete);
    if (error) {
      console.error('[DELETE_STAFF_USER] Auth deletion error:', error);
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    console.log('[DELETE_STAFF_USER] Auth user deleted successfully:', userIdToDelete);
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders(origin) });

  } catch (e) {
    console.error('[DELETE_STAFF_USER] Unexpected error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: corsHeaders(origin) }
    );
  }
});
