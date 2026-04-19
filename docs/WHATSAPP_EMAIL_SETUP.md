# WhatsApp + Email Notifications — Setup Guide

Plug-and-play checklist for turning on the `notifications-dispatcher`
pipeline once Phase 1 (accounts, domain, template approval) is complete.

---

## What's already built

- `public.whatsapp_queue` table + retry/dedupe columns on `public.email_queue`
  (migration `20260419000000-notification-channels-queues.sql`).
- `on_appointment_lifecycle_change` trigger enqueues both channels on
  `booking_approved` and `service_completed`, gated on:
  - `clients.consent_reminders = true`
  - `clients.email` (for email) / `clients.phone` (for WhatsApp) not null
  - Stable `dedupe_key` so the trigger can't double-enqueue.
- Edge function `supabase/functions/notifications-dispatcher/index.ts`:
  drains both queues, calls Resend + Meta Cloud API, exponential backoff,
  5 retries, permanent-fail classification.
- In-app notifications keep working unchanged regardless of Phase 1 state.

## What you need from Phase 1

### Email (Resend)
1. Create Resend account.
2. Verify sending domain: add **SPF**, **DKIM**, and **DMARC** DNS records
   Resend prescribes. Wait until dashboard shows "Verified".
3. Create an API key with **Sending** permission.

### WhatsApp (Meta Cloud API — direct)
1. Meta Business Manager account.
2. WhatsApp Business Account (WABA) + a **phone number** registered to it
   (cannot be a phone number already registered to a personal WhatsApp).
3. A **System User** with a **permanent access token** scoped to
   `whatsapp_business_messaging` + `whatsapp_business_management`.
4. Submit and get approval for two **utility** message templates in pt-BR
   (not "marketing" — "utility" is cheaper and has higher delivery):

   **Template 1 — name: `booking_confirmed_v1`, category: utility, language: pt_BR**

   Body:
   ```
   Olá! Seu agendamento para {{1}} foi confirmado.
   Serviço: {{2}}
   Data: {{3}} às {{4}}.
   Até breve na Vettale!
   ```

   **Template 2 — name: `service_completed_v1`, category: utility, language: pt_BR**

   Body:
   ```
   O serviço {{2}} do {{1}} foi concluído.
   Pode vir buscá-lo quando preferir. Obrigado pela confiança!
   ```

   > The variable **order** (`{{1}}`, `{{2}}` …) must match the order in
   > `buildWhatsAppComponents` inside
   > `supabase/functions/notifications-dispatcher/index.ts`. If Meta makes
   > you reorder variables during approval, update that function's
   > `parameters` array to match.

   > If Meta changes a template name on approval, update the
   > `template_name` value in the trigger function (migration
   > `20260419000000`) — it's the only place names are set.

## Plug-and-play: turn it on

Once the accounts + approved templates are in hand:

### 1. Set edge function secrets

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxx \
  EMAIL_FROM="Vettale <no-reply@vettale.shop>" \
  WHATSAPP_ACCESS_TOKEN=EAAG... \
  WHATSAPP_PHONE_NUMBER_ID=1234567890
```

### 2. Deploy the function

```bash
supabase functions deploy notifications-dispatcher
```

### 3. Enable the cron schedule

Open the migration `20260419000000-notification-channels-queues.sql`,
uncomment the `cron.schedule(...)` block at the bottom, and replace
`<PROJECT_REF>` and `<SERVICE_ROLE_KEY>` with real values. Apply:

```bash
supabase db push
```

(Or run the `SELECT cron.schedule(...)` statement directly against
the production DB once.)

### 4. Smoke test

Enqueue a test row manually:

```sql
insert into public.email_queue
  (recipient_type, recipient_email, template, subject, payload, dedupe_key)
values
  ('client', 'your-email@example.com',
   'booking_approved',
   'Agendamento Confirmado – Vettale (TESTE)',
   '{"pet_name":"Rex","service_name":"Banho","date":"2026-05-01","time":"10:00"}'::jsonb,
   'test:' || gen_random_uuid()::text);
```

```sql
insert into public.whatsapp_queue
  (recipient_type, phone_e164, template_name, template_variables, dedupe_key)
values
  ('client', '+5511999999999',
   'booking_confirmed_v1',
   '{"pet_name":"Rex","service_name":"Banho","date":"2026-05-01","time":"10:00"}'::jsonb,
   'test:' || gen_random_uuid()::text);
```

Wait ≤1 min, then:

```sql
select id, status, retry_count, provider_message_id, error
from public.email_queue
where dedupe_key like 'test:%'
order by created_at desc limit 5;

select id, status, retry_count, provider_message_id, error
from public.whatsapp_queue
where dedupe_key like 'test:%'
order by created_at desc limit 5;
```

Status should flip from `pending` → `sent` with `provider_message_id` populated.

### 5. End-to-end

1. Create a test client with your own email + phone, `consent_reminders = true`.
2. Book an appointment, then confirm it as admin.
3. Within ~1 min you should receive: in-app notification (immediate),
   email (Resend), WhatsApp template message.
4. Mark service completed → receive completion email + WhatsApp.

## Operations

- **Monitor failures**: `select * from email_queue where status = 'failed'`
  and same for `whatsapp_queue`. The `error` column has the provider response.
- **Retry a failed row**: `update ... set status='pending', retry_count=0, next_retry_at=null where id=...`.
- **Disable a channel**: `update clients set consent_reminders=false where id=...`
  (trigger will stop enqueuing future sends for that client).
- **Dispose of the legacy function**: once the new pipeline is verified
  in production, delete `supabase/functions/send-booking-notifications/`.
  It is not wired to anything in the current app source.

## Costs (rough, BR)

- **Email (Resend)**: free up to 3k/mo, then ~$20/mo = 50k emails.
- **WhatsApp (Meta utility)**: ~R$0.04–0.08 per message in Brazil.
  Billed monthly from Meta Business Manager.

## Limitations / to revisit later

- No per-channel opt-out today — `consent_reminders` gates both.
  If you want channel-level control (e.g., "email only"), add
  `consent_email` / `consent_whatsapp` columns to `clients` and update
  the two `IF v_consent_rem AND ...` checks in the trigger.
- Phone format: dispatcher trims a leading `+` for Meta's API but does
  not re-validate E.164. Keep the PhoneInput in
  `src/pages/Profile.tsx` as the source of truth for format.
- No per-admin BCC / staff notification — scope is client-facing only.
