import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders as getCors } from '../_shared/cors.ts';

serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: getCors(origin) });
  try {
    const { name, phone, reason, to } = await req.json();
    if (!name || !phone || !reason || !to) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...getCors(origin), "content-type": "application/json" },
      });
    }
    // If SMTP is configured, send email here. Otherwise just log.
    console.log("[CONTACT_INTAKE]", { to, name, phone, reason });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...getCors(origin), "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500,
      headers: { ...getCors(origin), "content-type": "application/json" },
    });
  }
});


