# Calendário — Agendamentos Duplos (Dual-Service) — Central Log

Área: renderização correta de agendamentos com dois serviços em calendários de staff/admin.  
Arquivos afetados: `AdminAgendaHoje.tsx`, `StaffCalendar.tsx`, `GroomerCalendar.tsx`.  
Tabelas envolvidas: `appointments`, `appointment_services`, `appointment_staff`.

---

## 2026-04-03 — Fix: Renderização Per-Staff, Per-Serviço

### Problema anterior

Todos os calendários tratavam o agendamento como um bloco único:

- **`AdminAgendaHoje.tsx`**: usava `appointment_staff[0]` — apenas o primeiro staff recebia o bloco; o segundo ficava invisível
- **`StaffCalendar.tsx`**: usava o `duration` e `time` do agendamento inteiro — o Staff B via o bloco completo (ex: 09:00–11:40) em vez de só seu serviço (ex: 09:40–11:40)
- **`GroomerCalendar.tsx`**: mesmo problema do `StaffCalendar`

**Exemplo concreto (appointment `49c15bad`, 10 Abr 2026):**

| Serviço | Staff | Hora real | Duração |
|---|---|---|---|
| Banho Completo (order 1) | Rogério | 09:00 | 40 min |
| Tosa (order 2) | Amanda | 09:40 | 120 min |

Antes do fix: Rogério via 09:00–11:40 (bloco completo). Amanda podia não aparecer. Agora: Rogério vê 09:00–09:40, Amanda vê 09:40–11:40.

---

### Lógica de Correção

Para cada appointment retornado do banco, os serviços são ordenados por `service_order` e os start times calculados acumulativamente:

```typescript
let offsetMinutes = 0;
for (const svc of apptServices) {  // ordenados por service_order
  const startTotalMin = baseH * 60 + baseM + offsetMinutes;
  // ... criar entrada com start time calculado
  offsetMinutes += svc.duration;
}
```

Para o calendário de staff, filtra apenas o serviço atribuído ao staff logado:

```typescript
const isAssigned = staffRows.some(s => s.service_id === svc.service_id);
if (isAssigned) { /* adicionar entrada */ }
```

---

### Queries Modificadas

Todos os três arquivos agora incluem `appointment_services` e `appointment_staff` com `service_id`:

```typescript
// Novo select (simplificado)
appointment_services(service_id, service_order, duration, services(name)),
appointment_staff(staff_profile_id, service_id, role)
```

A linkagem entre staff e serviço é feita via `appointment_staff.service_id = appointment_services.service_id`.

---

### Arquivos Alterados

| Arquivo | Alteração |
|---|---|
| `src/pages/AdminAgendaHoje.tsx` | Novo SELECT + explode dual-service no transformedData |
| `src/pages/StaffCalendar.tsx` | Novo SELECT + filtra apenas serviço do staff logado |
| `src/pages/GroomerCalendar.tsx` | Mesmo padrão do StaffCalendar |

---

## Referência: Schema Relevante

**`appointment_services`**

| Campo | Tipo | Descrição |
|---|---|---|
| `appointment_id` | uuid | Chave para appointments |
| `service_id` | uuid | Referência ao serviço |
| `service_order` | int | 1 = primeiro serviço, 2 = segundo |
| `duration` | int | Duração em minutos **deste** serviço |
| `status` | text | `not_started` / `in_progress` / `completed` |

**`appointment_staff`**

| Campo | Tipo | Descrição |
|---|---|---|
| `appointment_id` | uuid | Chave para appointments |
| `staff_profile_id` | uuid | Staff atribuído |
| `service_id` | uuid | Serviço específico atribuído a este staff |
| `role` | text | `banhista` / `tosador` / etc |

**Nota:** `appointments.duration` é o total combinado. Para calcular os tempos por serviço, sempre usar `appointment_services.duration` com `service_order`.

---

## Referência: Agendamento com Serviço Único

Para agendamentos com apenas um serviço em `appointment_services`, o comportamento original é mantido — nenhuma explosão ocorre, e o bloco usa `appointment.duration` como fallback se `appointment_services.duration` for nulo.
