// Deno Edge Function - Delete Staff Auth User
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders as getCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(origin) });

  try {
    const { user_id, email, staff_profile_id } = await req.json();
    console.log('🗑️ [DELETE_STAFF_USER] Request:', { user_id, email, staff_profile_id });

    if (!user_id && !email) {
      return new Response(JSON.stringify({ ok: false, error: 'user_id or email is required' }), { status: 400, headers: getCors(origin)});
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find and delete the auth user
    let userIdToDelete = user_id;
    
    if (!userIdToDelete && email) {
      // Find user by email
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
      if (userError) {
        console.error('❌ [DELETE_STAFF_USER] Error listing users:', userError);
        return new Response(JSON.stringify({ ok: false, error: 'Failed to find user by email' }), { status: 400, headers: getCors(origin)});
      }
      
      const userToDelete = userData.users.find(u => u.email === email);
      if (userToDelete) {
        userIdToDelete = userToDelete.id;
        console.log('✅ [DELETE_STAFF_USER] Found user by email:', userIdToDelete);
      } else {
        console.log('ℹ️ [DELETE_STAFF_USER] No auth user found for email:', email);
        return new Response(JSON.stringify({ ok: true, message: 'No auth user found to delete' }), { headers: getCors(origin)});
      }
    }
    
    // Delete the auth user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userIdToDelete);
    
    if (error) {
      console.error('❌ [DELETE_STAFF_USER] Auth deletion error:', error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400, headers: getCors(origin)});
    }

    console.log('✅ [DELETE_STAFF_USER] Auth user deleted successfully:', userIdToDelete);
    return new Response(JSON.stringify({ ok: true }), { headers: getCors(origin)});
    
  } catch (e) {
    console.error('❌ [DELETE_STAFF_USER] Unexpected error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: getCors(origin)});
  }
});
