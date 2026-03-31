
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { Resend } from "npm:resend@2.0.0";
import { corsHeaders as getCors } from '../_shared/cors.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface BookingNotificationRequest {
  appointmentId: string;
  userEmail: string;
  userName: string;
  petName: string;
  serviceName: string;
  date: string;
  time: string;
  providerName?: string;
  providerEmail?: string;
  notes?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(origin) });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const {
      appointmentId,
      userEmail,
      userName,
      petName,
      serviceName,
      date,
      time,
      providerName,
      providerEmail,
      notes
    }: BookingNotificationRequest = await req.json();

    console.log('📧 Sending booking notifications for appointment:', appointmentId);

    // Format date for display
    const formattedDate = new Date(date).toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const LOGO = "https://vettale.shop/Logo.png";

    const emailShell = (body: string) => `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);padding:28px 32px;text-align:center;">
                  <img src="${LOGO}" alt="Vettale" height="48" style="display:inline-block;height:48px;max-width:180px;object-fit:contain;" />
                </td>
              </tr>
              <!-- Body -->
              <tr><td style="padding:32px;text-align:center;">${body}</td></tr>
              <!-- Footer -->
              <tr>
                <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
                  <p style="margin:0;font-size:13px;color:#94a3b8;">© ${new Date().getFullYear()} Vettale · <a href="https://vettale.shop" style="color:#2563eb;text-decoration:none;">vettale.shop</a></p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `;

    const detailRow = (label: string, value: string) => `
      <tr>
        <td style="padding:8px 12px;font-size:14px;color:#64748b;width:130px;vertical-align:top;">${label}</td>
        <td style="padding:8px 12px;font-size:14px;color:#1e293b;font-weight:600;">${value}</td>
      </tr>
    `;

    const detailsTable = (rows: string) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:20px 0;">
        ${rows}
      </table>
    `;

    const statusBadge = (text: string, bg: string, color: string) => `
      <div style="display:inline-block;background:${bg};color:${color};font-size:13px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:0.3px;">${text}</div>
    `;

    // 1. Send email to client
    await resend.emails.send({
      from: "Vettale <no-reply@vettale.com>",
      to: [userEmail],
      subject: "Agendamento Enviado - Aguardando Aprovação",
      html: emailShell(`
        <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Agendamento Enviado! 🐾</h2>
        <p style="margin:0 0 20px;color:#475569;font-size:15px;">Olá <strong>${userName}</strong>, seu agendamento foi recebido com sucesso.</p>

        ${detailsTable(
          detailRow("Pet", petName) +
          detailRow("Serviço", serviceName) +
          detailRow("Data", formattedDate) +
          detailRow("Horário", time) +
          (providerName ? detailRow("Profissional", providerName) : '') +
          (notes ? detailRow("Observações", notes) : '')
        )}

        <table cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;width:100%;margin:20px 0;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:14px;color:#92400e;">
              ${statusBadge("Aguardando Aprovação", "#fef3c7", "#b45309")}
            </p>
            <p style="margin:8px 0 0;font-size:14px;color:#78350f;">Nossa equipe analisará sua solicitação e você receberá uma confirmação em breve.</p>
          </td></tr>
        </table>

        <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Atenciosamente,<br><strong style="color:#1e293b;">Equipe Vettale</strong></p>
      `),
    });

    // 2. Send email to provider (if assigned)
    if (providerEmail && providerName) {
      await resend.emails.send({
        from: "Vettale <no-reply@vettale.com>",
        to: [providerEmail],
        subject: "Nova Solicitação de Agendamento",
        html: emailShell(`
          <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Nova Solicitação de Agendamento</h2>
          <p style="margin:0 0 20px;color:#475569;font-size:15px;">Olá <strong>${providerName}</strong>, você foi atribuído a um novo agendamento pendente de aprovação.</p>

          ${detailsTable(
            detailRow("Cliente", userName) +
            detailRow("Pet", petName) +
            detailRow("Serviço", serviceName) +
            detailRow("Data", formattedDate) +
            detailRow("Horário", time) +
            (notes ? detailRow("Observações", notes) : '')
          )}

          <table cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;width:100%;margin:20px 0;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:14px;">${statusBadge("Reserva Provisória", "#dbeafe", "#1d4ed8")}</p>
              <p style="margin:8px 0 0;font-size:14px;color:#1e40af;">Este horário ficará reservado provisoriamente até a confirmação administrativa.</p>
            </td></tr>
          </table>

          <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Atenciosamente,<br><strong style="color:#1e293b;">Equipe Vettale</strong></p>
        `),
      });
    }

    // 3. Get admin emails and send notification
    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        users:user_id (
          email,
          raw_user_meta_data
        )
      `)
      .eq('role', 'admin');

    if (adminUsers && adminUsers.length > 0) {
      for (const adminUser of adminUsers) {
        if (adminUser.users?.email) {
          await resend.emails.send({
            from: "Vettale <no-reply@vettale.com>",
            to: [adminUser.users.email],
            subject: "Nova Solicitação de Agendamento - Aprovação Necessária",
            html: emailShell(`
              <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Aprovação Necessária</h2>
              <p style="margin:0 0 20px;color:#475569;font-size:15px;">Uma nova solicitação de agendamento foi recebida e aguarda sua aprovação.</p>

              ${detailsTable(
                detailRow("Cliente", `${userName} · ${userEmail}`) +
                detailRow("Pet", petName) +
                detailRow("Serviço", serviceName) +
                detailRow("Data", formattedDate) +
                detailRow("Horário", time) +
                (providerName ? detailRow("Profissional", providerName) : '') +
                (notes ? detailRow("Observações", notes) : '')
              )}

              <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;width:100%;margin:20px 0;">
                <tr><td style="padding:16px 20px;">
                  <p style="margin:0 0 4px;font-size:14px;">${statusBadge("Ação Necessária", "#fee2e2", "#b91c1c")}</p>
                  <p style="margin:8px 0 0;font-size:14px;color:#991b1b;">Acesse o painel administrativo para aprovar ou rejeitar esta solicitação.</p>
                </td></tr>
              </table>

              <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Atenciosamente,<br><strong style="color:#1e293b;">Sistema Vettale</strong></p>
            `),
          });
        }
      }
    }

    console.log('✅ All booking notifications sent successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Notifications sent successfully' }), 
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...getCors(origin) },
      }
    );

  } catch (error: any) {
    console.error('❌ Error sending booking notifications:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCors(origin) },
      }
    );
  }
};

serve(handler);
