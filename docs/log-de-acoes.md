# Log de Ações — Central Log

Área: sistema de logs administrativos (ações, edições).  
Páginas afetadas: `AdminActionLog`, `AdminEditLogs`, `AdminDashboard`, `AdminLayout`.  
Rotas: `/admin/action-log`, `/admin/edit-logs`.

---

## 2026-04-03 — Remoção de Audit Logs e Simplificação da Estrutura

**Situação anterior — três módulos de log coexistentes:**

| Rota | Componente | Descrição |
|---|---|---|
| `/admin/logs` | `AdminLogs` | "Audit Logs" — dados mockados, sem conexão real |
| `/admin/action-log` | `AdminActionLog` | Log real de ações (tabela `action_logs`) |
| `/admin/edit-logs` | `AdminEditLogs` | Log real de edições (view `admin_edit_logs_detailed`) |

O dashboard tinha o botão "Logs de Ações" apontando para `/admin/logs` (os dados mockados), não para o log real.

**Alterações realizadas:**

1. **`src/App.tsx`** — Removido import de `AdminLogs` e rota `/admin/logs`
2. **`src/components/AdminLayout.tsx`** — Removida entrada "Audit Logs" do menu System; "Edit Logs" renomeado para "Histórico de Edições"
3. **`src/pages/AdminDashboard.tsx`** — Botão "Logs de Ações" corrigido para rotear para `/admin/action-log`

**Estrutura resultante (simplificada):**

| Rota | Componente | Label no menu | Descrição |
|---|---|---|---|
| `/admin/action-log` | `AdminActionLog` | Log de Ações | Ações administrativas (tabela `action_logs`) |
| `/admin/edit-logs` | `AdminEditLogs` | Histórico de Edições | Edições em agendamentos (view `admin_edit_logs_detailed`) |

---

## Referência: Fontes de Dados

**`action_logs`** — populada por `logAction()` em `src/utils/actionLogger.ts`.  
Chamada em: `AdminClients`, `AdminPets`, `AdminBookingPage`, `AdminManualBooking`, `AdminSettings`, `AdminEditBooking`, `AdminBookingSuccess`, `EditServicePricing`, `ServiceStatusDropdown`, `AppointmentActions`, `PendingApprovalsSection`, `adminBookingUtils`.

**`admin_edit_logs_detailed`** — view do banco, populada automaticamente ao editar agendamentos via RPCs de edição.

---

## Referência: Adição de Novas Entradas de Log

Para registrar uma nova ação administrativa:

```typescript
import { logAction } from '@/utils/actionLogger';

void logAction({
  action_type: 'config_updated',   // ou booking_created, client_deleted, etc.
  category: 'booking',             // booking | client | pet | settings | pricing
  description: 'Descrição legível da ação',
  link_type: 'booking',            // tipo de entidade relacionada
  link_id: appointmentId,          // ID da entidade
  metadata: { chave: valor },      // dados extras opcionais
});
```

Migration que criou a tabela: `supabase/migrations/20260330000001_create_action_logs.sql`
