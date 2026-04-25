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

const LOGO_URL = "https://vettale.shop/Logo.png";

function shell(bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Vettale" height="48" style="display:inline-block;height:48px;max-width:180px;object-fit:contain;" />
        </td></tr>
        <tr><td style="padding:36px 32px;">${bodyHtml}</td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#94a3b8;">Com carinho,<br/><strong style="color:#1e293b;">Equipe Vettale</strong></p>
          <p style="margin:8px 0 0;font-size:12px;color:#cbd5e1;">© ${new Date().getFullYear()} Vettale · <a href="https://vettale.shop" style="color:#2563eb;text-decoration:none;">vettale.shop</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function detailsCard(rows: Array<[string, string]>): string {
  const tds = rows.map(([k, v]) => `<tr>
      <td style="padding:10px 16px;font-size:14px;color:#64748b;width:120px;vertical-align:top;">${k}</td>
      <td style="padding:10px 16px;font-size:15px;color:#0f172a;font-weight:600;">${v}</td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:24px 0;">${tds}</table>`;
}

function formatBrDate(d: unknown): string {
  if (!d) return "";
  const s = String(d);
  // Treat YYYY-MM-DD as a calendar date, not a UTC instant, to avoid TZ rollover
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  if (isNaN(date.getTime())) return s;
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatBrTime(t: unknown): string {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function renderEmailTemplate(template: string, p: Record<string, unknown>): string | null {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
    ));

  const petName = esc(p.pet_name) || "seu pet";
  const serviceName = esc(p.service_name) || "o serviço";
  const isVet = String(p.service_type ?? "") === "veterinary";

  switch (template) {
    case "booking_approved": {
      const date = esc(formatBrDate(p.date));
      const time = esc(formatBrTime(p.time));
      const heading = isVet
        ? `Consulta confirmada para ${petName} 🩺`
        : `Tudo pronto para receber ${petName}! 🐾`;
      const intro = isVet
        ? `Sua consulta veterinária está confirmada. Ficaremos felizes em cuidar do <b>${petName}</b>.`
        : `Seu agendamento está confirmado e mal podemos esperar para mimar o <b>${petName}</b>!`;
      const closer = isVet
        ? `Se precisar remarcar ou tiver qualquer dúvida antes da consulta, é só nos avisar.`
        : `Se precisar mudar algo, é só falar com a gente. Até logo!`;

      return shell(`
        <h1 style="margin:0 0 8px;font-size:24px;color:#0f172a;line-height:1.3;">${heading}</h1>
        <p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.6;">${intro}</p>
        ${detailsCard([
          ["Pet", petName],
          ["Serviço", serviceName],
          ["Data", date],
          ["Horário", time],
        ])}
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 18px;margin:8px 0 20px;">
          <p style="margin:0;font-size:14px;color:#065f46;"><b>✓ Confirmado</b> — guardamos esse horário para vocês.</p>
        </div>
        <p style="margin:16px 0 0;font-size:14px;color:#64748b;line-height:1.6;">${closer}</p>
      `);
    }

    case "service_completed": {
      const heading = isVet
        ? `Atendimento de ${petName} concluído 💙`
        : `${petName} está pronto e cheiroso! ✨`;
      const intro = isVet
        ? `O atendimento de <b>${serviceName}</b> foi finalizado. Cuidamos de tudo com muito carinho.`
        : `Acabamos o <b>${serviceName}</b> do <b>${petName}</b> — ficou um arraso!`;
      const callout = isVet
        ? `Pode vir buscá-lo quando preferir. Em breve você receberá orientações pós-consulta, se aplicável.`
        : `Pode vir buscar o <b>${petName}</b> quando puder — ele já está te esperando!`;

      return shell(`
        <h1 style="margin:0 0 8px;font-size:24px;color:#0f172a;line-height:1.3;">${heading}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">${intro}</p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin:8px 0 20px;">
          <p style="margin:0;font-size:14px;color:#78350f;line-height:1.6;">${callout}</p>
        </div>
        <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.6;">Obrigado pela confiança em deixar o <b>${petName}</b> com a gente. 🐾<br/>Que tal contar pra gente como foi? Sua avaliação ajuda outras famílias e nos ajuda a melhorar.</p>
      `);
    }

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
