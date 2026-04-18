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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const authResult = await requireAdmin(req, admin, origin);
  if ('error' in authResult) return authResult.error;

  try {
    const { user_id, email } = await req.json();

    let uid = user_id as string | null;
    if (!uid && email) {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (!error) {
        uid = data?.users?.find(u => u?.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
      }
    }

    if (uid) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }

    return new Response(
      JSON.stringify({ ok: true, user_id: uid ?? null }),
      { headers: corsHeaders(origin) }
    );
  } catch (e) {
    console.error('[ADMIN_DELETE_AUTH] unexpected:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: corsHeaders(origin) }
    );
  }
});
