# Status de Serviço — Central Log

Área: transições de status de serviço no fluxo admin/staff.  
Tabelas afetadas: `appointments`, `appointment_services`.  
RPCs afetadas: `mark_appointment_service_status`, `appointment_set_service_status`.

---

## 2026-04-03 — Fix: Transição Direta e Atualização de Status no UI

**Problema 1 — Transição `não iniciado → concluído` bloqueada**

A função `mark_appointment_service_status` (usada pelo admin via `ServiceStatusDropdown`) rejeitava qualquer transição que não fosse sequencial:

```sql
-- comportamento antigo (bloqueava skip):
IF v_current = 'not_started' AND _status <> 'in_progress' THEN
  RAISE EXCEPTION 'invalid_transition';
```

O frontend (`ServiceStatusDropdown.tsx` linha 40) já exibia "Concluído" como opção para admins (`isAdmin ? ['in_progress','completed'] : ['in_progress']`), mas o RPC rejeitava.

**Fix aplicado:** Permissão de skip `not_started → completed`:

```sql
IF v_current = 'not_started' AND _status NOT IN ('in_progress', 'completed') THEN
  RAISE EXCEPTION 'invalid_transition';
```

A mesma correção foi aplicada em `appointment_set_service_status` (usado pelo GroomerCalendar).

---

**Problema 2 — "Pendente Conclusão" não desaparecia após marcar como concluído**

O badge "Pendente conclusão" em `AdminAppointments.tsx` é exibido quando `appointments.status = 'confirmed'` e a data é passada. O RPC só atualizava `appointments.service_status` (agregado de serviços), nunca o campo de ciclo de vida `appointments.status`.

**Fix aplicado:** Promoção automática do lifecycle ao concluir todos os serviços:

```sql
IF v_new_app_service_status = 'completed' THEN
  UPDATE public.appointments
     SET status = 'completed'
   WHERE id = _appointment_id
     AND status NOT IN ('cancelled', 'canceled');
END IF;
```

---

**Arquivos alterados:**

| Arquivo | Tipo | Alteração |
|---|---|---|
| `supabase/migrations/20260403000001-fix-service-status-transitions.sql` | Migration | Nova versão de ambos os RPCs |
| `mark_appointment_service_status` (DB live) | RPC | Aplicado via `apply_migration` |
| `appointment_set_service_status` (DB live) | RPC | Aplicado via `apply_migration` |

**Arquivos sem alteração:** `ServiceStatusDropdown.tsx`, `ServiceStatusSection.tsx` — o frontend já estava correto.

---

## Referência: Fluxo de Status

```
not_started
  ├─► in_progress ──► completed
  └─► completed          (skip permitido para admin)
```

- Reversão para `not_started` **nunca** é permitida
- `completed` é terminal — nenhuma transição a partir dele
- Ao atingir `completed`, o lifecycle `appointments.status` também é promovido automaticamente
- Appointmens cancelados (`cancelled`/`canceled`) ignoram a promoção de lifecycle
