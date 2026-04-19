// ============================================================
// notifications-dispatcher
//
// Drains the email_queue and whatsapp_queue tables and delivers
// pending messages via Resend (email) and Meta Cloud API (WhatsApp).
//
// Invoked by pg_cron every minute (see migration 20260419000000).
// Can also be invoked manually with POST { "source": "manual" }.
//
// Env vars required to actually send:
//   RESEND_API_KEY              — Resend API key (email)
//   EMAIL_FROM                  — e.g. "Vettale <no-reply@vettale.shop>"
//   WHATSAPP_ACCESS_TOKEN       — Meta Cloud API permanent token
//   WHATSAPP_PHONE_NUMBER_ID    — Meta Cloud API phone number id
//
// If keys are missing the dispatcher short-circuits with a
// clear log line — safe to deploy before Phase 1 completes.
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders as getCors } from "../_shared/cors.ts";

const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const BACKOFF_BASE_SECONDS = 60; // 1m, 2m, 4m, 8m, 16m

// ── Provider interfaces ────────────────────────────────────────────────────
interface EmailRow {
  id: string;
  recipient_email: string | null;
  template: string;
  subject: string;
  payload: Record<string, unknown>;
  retry_count: number;
}

interface WhatsAppRow {
  id: string;
  phone_e164: string;
  template_name: string;
  template_language: string;
  template_variables: Record<string, unknown>;
  retry_count: number;
}

interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  // If true, retry with backoff. If false, mark failed immediately (permanent).
  retryable?: boolean;
}

// ── Email provider: Resend ─────────────────────────────────────────────────
async function sendEmail(row: EmailRow): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");

  if (!apiKey || !from) {
    return { ok: false, retryable: true, error: "RESEND_API_KEY or EMAIL_FROM not configured" };
  }
  if (!row.recipient_email) {
    return { ok: false, retryable: false, error: "missing recipient_email" };
  }

  const html = renderEmailTemplate(row.template, row.payload);
  if (!html) {
    return { ok: false, retryable: false, error: `unknown template: ${row.template}` };
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [row.recipient_email],
      subject: row.subject,
      html,
    }),
  });

  if (resp.ok) {
    const data = await resp.json().catch(() => ({}));
    return { ok: true, providerMessageId: data?.id };
  }

  const text = await resp.text().catch(() => "");
  // 4xx except 429 = permanent; 429 + 5xx = retry
  const retryable = resp.status === 429 || resp.status >= 500;
  return { ok: false, retryable, error: `resend ${resp.status}: ${text.slice(0, 500)}` };
}

// ── WhatsApp provider: Meta Cloud API ──────────────────────────────────────
async function sendWhatsApp(row: WhatsAppRow): Promise<SendResult> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!token || !phoneId) {
    return { ok: false, retryable: true, error: "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured" };
  }

  // Build template components from ordered variables.
  // The exact variable order must match the template as approved in Meta Business Manager.
  // See WHATSAPP_SETUP.md for the canonical variable list per template.
  const components = buildWhatsAppComponents(row.template_name, row.template_variables);
  if (!components) {
    return { ok: false, retryable: false, error: `unknown template: ${row.template_name}` };
  }

  const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: row.phone_e164.replace(/^\+/, ""),
      type: "template",
      template: {
        name: row.template_name,
        language: { code: row.template_language || "pt_BR" },
        components,
      },
    }),
  });

  if (resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const id = data?.messages?.[0]?.id;
    return { ok: true, providerMessageId: id };
  }

  const text = await resp.text().catch(() => "");
  const retryable = resp.status === 429 || resp.status >= 500;
  return { ok: false, retryable, error: `meta ${resp.status}: ${text.slice(0, 500)}` };
}

// ── Template rendering ─────────────────────────────────────────────────────
//
// Keep these simple until Phase 1 finishes. Once Resend/Meta are set up
// you can swap in React Email / richer HTML without touching the queue.

function renderEmailTemplate(template: string, p: Record<string, unknown>): string | null {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
    ));

  switch (template) {
    case "booking_approved":
      return `
        <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
          <h2>Agendamento Confirmado</h2>
          <p>Olá! Seu agendamento para <b>${esc(p.pet_name)}</b> foi confirmado.</p>
          <p><b>Serviço:</b> ${esc(p.service_name)}<br/>
             <b>Data:</b> ${esc(p.date)}<br/>
             <b>Horário:</b> ${esc(p.time)}</p>
          <p>Até breve na Vettale!</p>
        </div>`;
    case "service_completed":
      return `
        <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
          <h2>Serviço Concluído</h2>
          <p>O serviço <b>${esc(p.service_name)}</b> do <b>${esc(p.pet_name)}</b> foi concluído.</p>
          <p>Pode vir buscá-lo quando preferir. Obrigado pela confiança!</p>
        </div>`;
    default:
      return null;
  }
}

function buildWhatsAppComponents(template: string, vars: Record<string, unknown>): unknown[] | null {
  const txt = (v: unknown) => ({ type: "text", text: String(v ?? "") });

  switch (template) {
    case "booking_confirmed_v1":
      // Variables (in order): {{1}} pet_name, {{2}} service_name, {{3}} date, {{4}} time
      return [{
        type: "body",
        parameters: [txt(vars.pet_name), txt(vars.service_name), txt(vars.date), txt(vars.time)],
      }];
    case "service_completed_v1":
      // Variables (in order): {{1}} pet_name, {{2}} service_name
      return [{
        type: "body",
        parameters: [txt(vars.pet_name), txt(vars.service_name)],
      }];
    default:
      return null;
  }
}

// ── Queue draining ─────────────────────────────────────────────────────────
async function drainEmail(sb: SupabaseClient): Promise<{ sent: number; failed: number; skipped: number }> {
  const { data: rows, error } = await sb
    .from("email_queue")
    .select("id, recipient_email, template, subject, payload, retry_count")
    .eq("status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[dispatcher] email select error:", error);
    return { sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const row of (rows ?? []) as EmailRow[]) {
    const result = await sendEmail(row);
    if (result.ok) {
      await sb.from("email_queue").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: result.providerMessageId ?? null,
        error: null,
      }).eq("id", row.id);
      sent++;
    } else {
      const nextRetry = row.retry_count + 1;
      const isPermanent = result.retryable === false;
      const giveUp = isPermanent || nextRetry >= MAX_RETRIES;
      if (giveUp) {
        await sb.from("email_queue").update({
          status: "failed",
          retry_count: nextRetry,
          error: result.error ?? "unknown error",
        }).eq("id", row.id);
        failed++;
      } else {
        const delay = BACKOFF_BASE_SECONDS * Math.pow(2, row.retry_count);
        await sb.from("email_queue").update({
          retry_count: nextRetry,
          next_retry_at: new Date(Date.now() + delay * 1000).toISOString(),
          error: result.error ?? null,
        }).eq("id", row.id);
        skipped++;
      }
    }
  }
  return { sent, failed, skipped };
}

async function drainWhatsApp(sb: SupabaseClient): Promise<{ sent: number; failed: number; skipped: number }> {
  const { data: rows, error } = await sb
    .from("whatsapp_queue")
    .select("id, phone_e164, template_name, template_language, template_variables, retry_count")
    .eq("status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[dispatcher] whatsapp select error:", error);
    return { sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const row of (rows ?? []) as WhatsAppRow[]) {
    const result = await sendWhatsApp(row);
    if (result.ok) {
      await sb.from("whatsapp_queue").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: result.providerMessageId ?? null,
        error: null,
      }).eq("id", row.id);
      sent++;
    } else {
      const nextRetry = row.retry_count + 1;
      const isPermanent = result.retryable === false;
      const giveUp = isPermanent || nextRetry >= MAX_RETRIES;
      if (giveUp) {
        await sb.from("whatsapp_queue").update({
          status: "failed",
          retry_count: nextRetry,
          error: result.error ?? "unknown error",
        }).eq("id", row.id);
        failed++;
      } else {
        const delay = BACKOFF_BASE_SECONDS * Math.pow(2, row.retry_count);
        await sb.from("whatsapp_queue").update({
          retry_count: nextRetry,
          next_retry_at: new Date(Date.now() + delay * 1000).toISOString(),
          error: result.error ?? null,
        }).eq("id", row.id);
        skipped++;
      }
    }
  }
  return { sent, failed, skipped };
}

// ── HTTP handler ───────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(origin) });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const startedAt = Date.now();
  const [email, wa] = await Promise.all([drainEmail(sb), drainWhatsApp(sb)]);
  const elapsedMs = Date.now() - startedAt;

  const summary = { email, whatsapp: wa, elapsedMs };
  console.log("[dispatcher] tick complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...getCors(origin), "Content-Type": "application/json" },
  });
});
