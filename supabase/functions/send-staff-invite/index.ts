// Deno Edge Function - Staff Account Setup (Password Reset Approach)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders as getCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(origin) });

  try {
    const { email, staff_profile_id, name } = await req.json();
    console.log('🔐 [STAFF_SETUP] Request:', { email, staff_profile_id, name });

    if (!email || !staff_profile_id) {
      return new Response(JSON.stringify({ ok: false, error: 'email and staff_profile_id are required' }), { status: 400, headers: getCors(origin)});
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const redirectTo = Deno.env.get('STAFF_CLAIM_REDIRECT') ?? 'https://vettale.shop/staff/claim';
    console.log('🔗 [STAFF_SETUP] Using redirectTo:', redirectTo);

    // Step 1: Try to create user directly (will fail if exists, which is fine)
    let userId;
    
    try {
      // Try to create user - this will fail if user already exists
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        email_confirm: true, // Auto-confirm email
        user_metadata: { type: 'staff', staff_profile_id: staff_profile_id }
      });
      
      if (createError) {
        // If user already exists, that's fine - we'll proceed with recovery
        if (createError.message.includes('already registered') || createError.message.includes('already exists')) {
          console.log('ℹ️ [STAFF_SETUP] User already exists, proceeding with recovery');
        } else {
          console.error('❌ [STAFF_SETUP] User creation error:', createError);
          return new Response(JSON.stringify({ ok: false, error: createError.message }), { status: 400, headers: getCors(origin)});
        }
      } else {
        userId = createData.user?.id;
        console.log('✅ [STAFF_SETUP] User created:', userId);
      }
    } catch (e) {
      console.log('ℹ️ [STAFF_SETUP] User creation failed (likely already exists):', e);
    }

    // Step 2: Send password reset link (this uses the password reset template)
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: { redirectTo: redirectTo }
    });
    
    if (resetError) {
      console.error('❌ [STAFF_SETUP] Password reset error:', resetError);
      return new Response(JSON.stringify({ ok: false, error: resetError.message }), { status: 400, headers: getCors(origin)});
    }

    console.log('✅ [STAFF_SETUP] Password reset link generated');

    // Step 3: Stamp invite time on staff profile
    const { error: updateError } = await supabaseAdmin
      .from('staff_profiles')
      .update({ 
        claim_invited_at: new Date().toISOString(), 
        email: email
        // user_id will be set by the trigger when email is confirmed
      })
      .eq('id', staff_profile_id);

    if (updateError) {
      console.error('❌ [STAFF_SETUP] Staff profile update error:', updateError);
    } else {
      console.log('✅ [STAFF_SETUP] Staff profile updated');
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      user_id: userId,
      reset_link: resetData.properties?.action_link,
      message: 'User created and password reset link sent'
    }), { headers: getCors(origin)});
    
  } catch (e) {
    console.error('❌ [STAFF_SETUP] Unexpected error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: getCors(origin)});
  }
});