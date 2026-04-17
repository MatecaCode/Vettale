// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as makeCors } from "../_shared/cors.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLAIM_REDIRECT = Deno.env.get("CLAIM_REDIRECT") ?? "https://vettale.shop/claim";

const admin = createClient(url, serviceKey, { auth: { persistSession: false }});

// Token bucket and dedupe (in-memory)
const tokens: Record<string, { t: number[] }> = {};
function allowAdminRate(userId: string, now = Date.now()) {
  const windowMs = 60_000;
  const limit = 10;
  const bucket = tokens[userId] ?? { t: [] };
  bucket.t = bucket.t.filter((ts) => now - ts < windowMs);
  if (bucket.t.length >= limit) return false;
  bucket.t.push(now);
  tokens[userId] = bucket;
  return true;
}

const dedupe = new Map<string, number>();
function notDuplicate(key: string, now = Date.now()) {
  const windowMs = 30_000;
  const last = dedupe.get(key) ?? 0;
  if (now - last < windowMs) return false;
  dedupe.set(key, now);
  return true;
}

serve(async (req) => {
  const h = makeCors(req.headers.get("origin"));
  if (req.method === 'OPTIONS') {
    const preflight = { ...h, 'Access-Control-Max-Age': '86400', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Origin': '*' };
    return new Response(null, { status: 204, headers: preflight });
  }

  try {
    // Auth after preflight
    const authHeader = req.headers.get("authorization") ?? "";
    const authClient = createClient(url, serviceKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uerr } = await authClient.auth.getUser();
    if (uerr || !user) {
      return new Response(JSON.stringify({ ok:false, code:"UNAUTHORIZED", reason:"Missing or invalid session" }), { status: 401, headers: { ...h, "content-type":"application/json" } });
    }

    // TEMP DEBUG
    console.log("[INVITE] start", {
      user_id: user.id,
      claim_redirect: CLAIM_REDIRECT
    });

    if (!allowAdminRate(user.id)) {
      return new Response(JSON.stringify({ ok:false, code:"RATE_LIMIT", reason:"Too many requests, slow down" }), { status: 429, headers: { ...h, "content-type":"application/json" } });
    }

    const body = await req.json();
    const { email, client_id, checkOnly } = body;

    // Dedupe by user+client+mode (ignore email to prevent duplicates when UI passes same client)
    const key = `${user.id}:${client_id}:${checkOnly ? 'check' : 'invite'}`;
    if (!notDuplicate(key)) {
      return new Response(JSON.stringify({ ok:true, skipped:true, code:"DEDUPE", reason:"Duplicate within 30s" }), { status: 200, headers: { ...h, "content-type":"application/json" } });
    }
    
    if (!email) {
      return new Response(JSON.stringify({ ok:false, error: 'email required' }), { 
        status: 400, 
        headers: { ...h, "content-type": "application/json" }
      });
    }

    // Email availability check mode
    if (checkOnly) {
      // Check if email exists in Auth
      try {
        const { data: authUser } = await admin.auth.admin.getUserByEmail(email);
        if (authUser?.user) {
          return new Response(JSON.stringify({ 
            ok:false,
            available: false, 
            reason: "already_registered" 
          }), { 
            status: 409,
            headers: { ...h, "content-type": "application/json" }
          });
        }
      } catch (_err) {
        // user not found → available to invite
      }

      // Check if email exists in clients table (case-insensitive)
      const { data: existingClients, error: clientCheckError } = await admin
        .from("clients")
        .select("id, email")
        .ilike("email", email)
        .limit(1);
      
      if (clientCheckError) {
        return new Response(JSON.stringify({ 
          ok:false,
          available: false, 
          reason: "check_error" 
        }), { 
          status: 500,
          headers: { ...h, "content-type": "application/json" }
        });
      }

      if (existingClients && existingClients.length > 0) {
        return new Response(JSON.stringify({ 
          ok:false,
          available: false, 
          reason: "already_registered" 
        }), { 
          status: 409,
          headers: { ...h, "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ ok:true, available: true }), { 
        status: 200,
        headers: { ...h, "content-type": "application/json" }
      });
    }

    // Normal invite mode - requires client_id
    if (!client_id) {
      return new Response(JSON.stringify({ ok:false, code:'NO_CLIENT', reason:'client_id required for invite' }), { 
        status: 400, 
        headers: { ...h, "content-type": "application/json" }
      });
    }

    // Policy via RPC (single source of truth) — must execute with user auth context
    console.log("[INVITE] rpc call admin_get_client_claim_status", { client_id });
    const { data: statusRows, error: rerr } = await authClient.rpc("admin_get_client_claim_status", { _client_ids: [client_id] });
    if (rerr) throw rerr;
    const s = statusRows?.[0];
    console.log("[INVITE] rpc result", s);
    if (!s) return new Response(JSON.stringify({ ok:false, code:"NOT_FOUND", reason:"Client not found" }), { status: 404, headers: { ...h, "content-type":"application/json" } });
    if (s.linked && !s.verified) {
      return new Response(JSON.stringify({ ok:false, code:"ALREADY_LINKED_UNVERIFIED", reason:"User exists. Use resend verification." }), { status: 409, headers: { ...h, "content-type":"application/json" } });
    }
    if (s.linked && s.verified) {
      return new Response(JSON.stringify({ ok:false, code:"ALREADY_LINKED", reason:"Client already linked" }), { status: 409, headers: { ...h, "content-type":"application/json" } });
    }
    if (!s.can_invite) {
      return new Response(JSON.stringify({ ok:false, code:"INVITE_BLOCKED", reason:"Invite not allowed by policy" }), { status: 409, headers: { ...h, "content-type":"application/json" } });
    }

    // Fetch client email (authoritative)
    const { data: clientRow } = await admin.from("clients").select("email").eq("id", client_id).single();
    const emailForInvite = clientRow?.email ?? email;
    if (!emailForInvite) return new Response(JSON.stringify({ ok:false, code:"NO_EMAIL", reason:"Client has no email" }), { status: 400, headers: { ...h, "content-type":"application/json" } });

    // send invite using Supabase Auth (uses your Invite template)
    console.log("[INVITE] inviteUserByEmail START", { emailForInvite, redirect: CLAIM_REDIRECT });
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(emailForInvite, {
      redirectTo: CLAIM_REDIRECT,
      data: { preclient_id: client_id }
    });
    if (inviteErr) throw inviteErr;
    console.log("[INVITE] inviteUserByEmail OK");

    // stamp invited time (optional)
    await admin.from("clients").update({ claim_invited_at: new Date().toISOString() }).eq("id", client_id);
    console.log("[INVITE] updated clients.claim_invited_at", { client_id });

    return new Response(JSON.stringify({ ok:true, status: "invited" }), { 
      status: 200,
      headers: { ...h, "content-type": "application/json" }
    });
  } catch (e: any) {
    console.error("[INVITE][ERROR]", { message: e?.message ?? String(e), details: e });
    const body = JSON.stringify({ ok:false, code:"ERROR", reason: String(e?.message ?? e) });
    return new Response(body, { 
      status: 500, 
      headers: { ...h, "content-type": "application/json" }
    });
  }
});
