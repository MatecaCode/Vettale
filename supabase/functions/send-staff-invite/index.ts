import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@2.0.0';

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
    const { email, staff_profile_id, name } = await req.json();
    console.log('[STAFF_INVITE] Request:', { email, staff_profile_id, name });

    if (!email || !staff_profile_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'email and staff_profile_id are required' }),
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const redirectTo = Deno.env.get('STAFF_CLAIM_REDIRECT') ?? 'https://vettale.shop/staff/claim';
    console.log('[STAFF_INVITE] redirectTo:', redirectTo);

    // Step 1: Create user if not exists
    let userId: string | undefined;
    try {
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: false,
        // type: 'staff_setup' is checked by handle_unified_registration trigger
        // to assign the 'staff' user_role on INSERT
        user_metadata: { type: 'staff_setup', staff_profile_id },
      });
      if (createError) {
        if (
          createError.message.includes('already registered') ||
          createError.message.includes('already exists')
        ) {
          console.log('[STAFF_INVITE] User already exists, proceeding with recovery');
        } else {
          console.error('[STAFF_INVITE] User creation error:', createError);
          return new Response(
            JSON.stringify({ ok: false, error: createError.message }),
            { status: 400, headers: corsHeaders(origin) }
          );
        }
      } else {
        userId = createData.user?.id;
        console.log('[STAFF_INVITE] User created:', userId);
      }
    } catch (e) {
      console.log('[STAFF_INVITE] createUser threw (likely already exists):', e);
    }

    // Step 2: Generate recovery link
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    if (resetError) {
      console.error('[STAFF_INVITE] generateLink error:', resetError);
      return new Response(
        JSON.stringify({ ok: false, error: resetError.message }),
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    // Safe optional chaining — resetData can be null in some SDK edge cases
    const claimLink = resetData?.properties?.action_link;
    console.log('[STAFF_INVITE] Recovery link generated, has link:', !!claimLink);

    // Step 3: Send email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey && claimLink) {
      try {
        const resend = new Resend(resendKey);
        const staffName = name ?? email;
        const { error: emailError } = await resend.emails.send({
          from: 'Vettale <no-reply@vettale.com>',
          to: [email],
          subject: 'Configure sua conta - Vettale',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
              <h2 style="color: #1a1a1a; margin-bottom: 8px;">Bem-vindo(a) à equipa Vettale!</h2>
              <p style="color: #444; font-size: 15px; line-height: 1.6;">
                Olá${staffName !== email ? ` ${staffName}` : ''},
              </p>
              <p style="color: #444; font-size: 15px; line-height: 1.6;">
                A sua conta de staff foi criada. Clique no botão abaixo para definir a sua password e aceder à plataforma.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${claimLink}"
                   style="background-color: #18181b; color: #ffffff; text-decoration: none;
                          padding: 14px 28px; border-radius: 8px; font-size: 15px;
                          font-weight: 600; display: inline-block;">
                  Configurar conta
                </a>
              </div>
              <p style="color: #888; font-size: 13px; line-height: 1.5;">
                Se não esperava este email, pode ignorá-lo com segurança.<br>
                O link expira em 24 horas.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #aaa; font-size: 12px; text-align: center;">Vettale</p>
            </div>
          `,
        });
        if (emailError) {
          console.error('[STAFF_INVITE] Resend error:', emailError);
        } else {
          console.log('[STAFF_INVITE] Invite email sent to:', email);
        }
      } catch (emailEx) {
        // Email failure is non-fatal — link was still generated
        console.error('[STAFF_INVITE] Email send threw:', emailEx);
      }
    } else {
      console.warn('[STAFF_INVITE] Skipping email — resendKey:', !!resendKey, 'claimLink:', !!claimLink);
    }

    // Step 4: Stamp invite timestamp
    const { error: updateError } = await supabaseAdmin
      .from('staff_profiles')
      .update({ claim_invited_at: new Date().toISOString(), email })
      .eq('id', staff_profile_id);
    if (updateError) {
      console.error('[STAFF_INVITE] Profile update error:', updateError);
    } else {
      console.log('[STAFF_INVITE] Staff profile stamped');
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: userId,
        message: 'Invite sent successfully',
      }),
      { headers: corsHeaders(origin) }
    );

  } catch (e) {
    console.error('[STAFF_INVITE] Unexpected error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: corsHeaders(origin) }
    );
  }
});
