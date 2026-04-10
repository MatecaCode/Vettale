# Agenda Admin — Central Log

Área: tela de agenda do admin (`/admin/agenda-hoje`).  
Página principal: `src/pages/AdminAgendaHoje.tsx`.  
Componentes de schedule: `src/components/schedule/`.

---

## 2026-04-03 — Overhaul da View Semanal + Date Picker + Botão "Ver Agendamento"

### 3a — View Semanal (Teams-style)

**Problema anterior:**  
A view semanal empilhava os staff verticalmente dentro de cada coluna de dia, tornando a grade extremamente alta e difícil de usar. Chips não eram clicáveis na view semanal.

**Mudanças nos componentes de schedule:**

**`src/components/schedule/WeekGrid.tsx`** — Refatorado:
- Rail de horários com `56px` de largura, colunas de dia com `minmax(140px, 1fr)` (min 1040px total)
- Gridlines horizontais sobrepostos via `position: absolute` sincronizados com o rail
- Passa `onClickAppointment` para `DayColumn` → `StaffLane` → `Chip`
- `todayISO` comparado para destacar o dia atual em azul

**`src/components/schedule/DayColumn.tsx`** — Refatorado:
- Staff exibidos **lado a lado** (sub-colunas), não empilhados
- Filtra para mostrar apenas staff com agendamentos no dia (reduz colunas vazias)
- Cores de borda de identificação por staff via `STAFF_COLORS` / `STAFF_BG` arrays
- Prop `isToday` destaca o header do dia em azul

**`src/components/schedule/StaffLane.tsx`** — Refatorado:
- Aceita `pixelsPerMinute`, `dayStartMinute`, `onClickAppointment` como props
- Remove dependência de constantes fixas globais (permite reuso em outros contextos)

**`src/components/schedule/Chip.tsx`** — Refatorado:
- Aceita prop `onClick`
- Borda esquerda colorida por status (`border-l-[3px]`)
- Modo compacto exibe apenas pet + horário
- Modo padrão exibe pet, serviço, horário

---

### 3b — Date Picker (Seletor de Data)

**Problema anterior:** Navegação apenas por "Hoje / ← / →", sem forma de pular para data específica.

**Implementação:**
- Substituído o texto de data estático por um `Popover` + `Calendar` (componentes UI existentes)
- O botão abre um calendário dropdown; selecionando uma data ela é aplicada diretamente em `selectedDate`
- Funciona tanto no modo dia quanto no modo semana
- Arquivo: `src/pages/AdminAgendaHoje.tsx` — imports adicionados: `Popover`, `PopoverContent`, `PopoverTrigger`, `Calendar as CalendarPicker`

---

### 3c — Botão "Ver Agendamento" no Modal de Evento

**Problema anterior:** O modal de detalhes do agendamento (ao clicar num evento) só tinha o botão "Fechar".

**Implementação:**
- Adicionado botão "Ver Agendamento" com ícone `ExternalLink` no rodapé do modal
- Ao clicar: fecha o modal e navega para `/admin/appointments?id={appointment_id}`
- Chips da view semanal conectados ao mesmo handler `handleWeekAppointmentClick(id)` — clique num chip na semana abre o mesmo modal detalhado

---

## Referência: Estrutura dos Componentes de Schedule

```
AdminAgendaHoje.tsx
  └── WeekLoadBar          — barra de carga por dia (clique muda selectedDate)
  └── WeekGrid             — grid semanal
        └── DayColumn      — coluna por dia, sub-colunas por staff
              └── StaffLane — lane absoluta com posicionamento por minuto
                    └── Chip — bloco de agendamento clicável
```

**Constantes de layout (WeekGrid.tsx):**
- `PIXELS_PER_MINUTE = 2` (30 min = 60px por linha de horário)
- `DAY_START_MINUTE = 9 * 60` (início às 09:00)
- `SLOT_HEIGHT_PX = 60` (altura de cada linha de 30min)

---

## Referência: Como Adicionar um Novo Campo ao Modal de Detalhes

O modal está em `AdminAgendaHoje.tsx` a partir da linha ~680. Os dados disponíveis são os campos de `AppointmentData`:

```typescript
interface AppointmentData {
  appointment_id: string;
  date: string;
  time: string;        // HH:MM
  duration: number;    // minutos
  service_name: string;
  pet_name: string;
  client_name: string;
  staff_id: string;
  staff_name: string;
  status: string;
  notes?: string;
}
```

Para expor mais dados (ex: raça do pet, telefone do cliente), adicionar ao SELECT em `fetchAppointments()` e ao `transformedData` map.
