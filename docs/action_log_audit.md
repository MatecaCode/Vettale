# Action Log Audit — Item 17-A
**Date:** 2026-03-31  
**Status:** Read-only audit — no code changes made  
**Purpose:** Map every admin mutation so that prompt 17-B can inject logging calls precisely.

---

## Table of Contents
1. [Category 1 — Bookings](#category-1--bookings)
2. [Category 2 — Clients](#category-2--clients)
3. [Category 3 — Pets](#category-3--pets)
4. [Category 4 — Pricing / Config](#category-4--pricing--config)
5. [Cross-Cutting Notes](#cross-cutting-notes)

---

## Category 1 — Bookings

---

### [Bookings] — Criar agendamento manual (RPC unificado)

- **File:** `src/pages/AdminManualBooking.tsx` (line ~1059–1077)
- **Function:** `createBooking(isOverride: boolean)`
- **Trigger:** `handleSubmit` → `createBooking(false)`; conflict modal → `handleOverrideConfirm` → `createBooking(true)`; `manualOverride` path (~1126–1129) → `createBooking(true)`
- **Supabase call:** `supabase.rpc('create_unified_admin_booking', payload)` (~1064)
- **Payload builder:** `buildCreatePayload()` (~985–1045); includes `_date`, `_time`, `_client_user_id`, `_client_id`, `_pet_id`, `_primary_service_id`, `_secondary_service_id`, `_provider_ids`, `_extra_fee`, `_extra_fee_reason`, `_created_by`, `_notes`, `_addons: []` (hardcoded, addons currently not passed), `_override_conflicts` (hardcoded `false` even when `isOverride=true` — **bug noted, flag not applied**)
- **Data available:** All of `bookingData` state object, `user.id` as `_created_by`
- **Success handling:** `toast.success`, then `navigate('/admin/booking-success', { state: { appointmentId } })` (~1073–1077)
- **Return value:** RPC returns the new `appointmentId` — **use this as `link_id`**
- **Suggested log entry:** `"Agendamento manual criado"` + `link_type: 'booking'` + `link_id: appointmentId`
- **Notes:**
  - This is the most critical RPC. Do NOT modify it. Log AFTER the RPC resolves successfully, before navigate().
  - `_addons` is always `[]`; add-ons are saved separately in `AdminBookingSuccess`.
  - The override flag is currently ineffective in the RPC payload — log it anyway from `isOverride` variable.

---

### [Bookings] — Criar agendamento via fluxo de revisão (RPC dual-service)

- **File:** `src/pages/AdminBookingPage.tsx` (line ~737–810)
- **Function:** `handleReviewConfirm(reviewData)`
- **Trigger:** Admin confirms booking in the review modal (final step of the booking page flow)
- **Supabase call:** `supabase.rpc('create_admin_booking_with_dual_services', { _client_user_id, _pet_id, _primary_service_id, _secondary_service_id, _date, _time, _price, _duration, _notes, _provider_ids, _extra_fee, _extra_fee_reason, _addons, _created_by })` (~767–782)
- **Data available:** Full review modal payload + component state (`selectedPrimaryService`, `totalDuration`, `totalPrice`, `selectedPet`, `selectedClient`, `user.id`)
- **Success handling:** `toast.success`, form reset, `navigate('/admin/appointments')` (~786–802)
- **Return value:** RPC returns new appointment ID
- **Suggested log entry:** `"Agendamento criado (fluxo de revisão)"` + `link_type: 'booking'` + `link_id: appointmentId`
- **Notes:** This is a second booking creation path distinct from `AdminManualBooking`. Log AFTER the RPC resolves.

---

### [Bookings] — Criar agendamento (utilitário legado)

- **File:** `src/utils/adminBookingUtils.ts` (line ~33–63)
- **Function:** `createAdminBooking(bookingData: AdminBookingData)`
- **Trigger:** Not actively called from any live admin page (likely unused/legacy — `AdminBookingPage` uses `create_admin_booking_with_dual_services` directly)
- **Supabase call:** `supabase.rpc('create_booking_admin', { _override_conflicts: bookingData.overrideConflicts, … })` (~40–52)
- **Data available:** `AdminBookingData` (single-service: client user, pet, service, providers, date, time, notes, price, duration, overrideConflicts)
- **Success handling:** Returns `{ success: true, appointmentId }` (~60–63); callers are responsible for toast/navigate
- **Return value:** `appointmentId` in return object
- **Suggested log entry:** `"Agendamento criado (admin)"` + `link_type: 'booking'` + `link_id: appointmentId`
- **Notes:** Verify whether any live caller uses this before adding logging. If dead code, log only as defensive measure.

---

### [Bookings] — Editar agendamento (RPCs de edição)

- **File:** `src/pages/AdminEditBooking.tsx` (line ~584–670)
- **Function:** `performEdit(data)`
- **Trigger:** `handleSubmit` (~522) → `performEdit`; override modal → `handleOverrideConfirm` (~672–675) → `performEdit(pendingEditData)`
- **Supabase call:** `supabase.rpc(rpcFunction, rpcParams)` where `rpcFunction` is either `edit_admin_booking_with_dual_services` or `edit_booking_admin` (~591–613). Params include `_appointment_id`, `_new_date`, `_new_time`, `_new_duration`, `_extra_fee`, `_extra_fee_reason`, `_admin_notes`, `_edit_reason`, `_edited_by`, `_force_override`, and (dual-service only) `_new_staff_ids`
- **Follow-up mutation:** If addon selected → `supabase.from('appointment_addons').insert({ appointment_id, addon_id, added_by })` (~624–631)
- **Data available:** `editData` from form state + `selectedStaffIds` + `serviceAddons`; `user.id` as `_edited_by`; `appointmentId` from route params
- **Success handling:** `toast`, `navigate('/admin/appointments')` (~650–660)
- **Suggested log entry:** `"Agendamento editado"` + `link_type: 'booking'` + `link_id: appointmentId`
- **Notes:**
  - Log AFTER the primary RPC resolves (before navigate). Also log the addon insert separately if it executes.
  - `_force_override` should be included in log metadata if true.
  - Staff pending changes (`applyPendingStaffChanges`) are NOT called from this flow — see next entry.

---

### [Bookings] — Editar agendamento (dialog legado)

- **File:** `src/components/appointment/EditBookingDialog.tsx` (line ~189–279)
- **Function:** `handleSubmit()`
- **Trigger:** Form submit inside the dialog (optional `window.confirm` on conflicts ~231)
- **Supabase call:** Same pair of RPCs (`edit_admin_booking_with_dual_services` / `edit_booking_admin`) (~240–252); `_force_override` derived from availability check
- **Data available:** Dialog state (date, time, fees, notes, reasons); appointment id from props
- **Success handling:** `toast`, `setOpen(false)`, `onEditSuccess()` (~270–271)
- **Suggested log entry:** `"Agendamento editado (dialog)"` + `link_type: 'booking'` + `link_id: appointmentId`
- **Notes:** No current imports of this component found in `src/` — may be legacy. Confirm usage before logging. No `appointment_addons` insert here.

---

### [Bookings] — Trocar funcionário no agendamento

- **File:** `src/pages/AdminEditBooking.tsx` (line ~330–364)
- **Function:** `applyPendingStaffChanges()`
- **Trigger:** **Currently NOT wired to any submit/save flow** — function exists but is not called from `handleSubmit` or `performEdit`. Dead path.
- **Supabase call:** `supabase.rpc('update_service_staff_assignment', { _appointment_id, _service_id, _new_staff_profile_id, _updated_by })` (~338–344), one call per pending staff change
- **Data available:** `pendingStaffChanges` array, `appointmentId`, `user.id`
- **Success handling:** `toast.success` per batch (~362)
- **Suggested log entry:** `"Funcionário do agendamento alterado"` + `link_type: 'booking'` + `link_id: appointmentId`
- **Notes:** A success callback MUST be wired before logging can be injected. When wired, log after the batch loop resolves. For dual-service edits, staff swap is handled inside `edit_admin_booking_with_dual_services` via `_new_staff_ids`.

---

### [Bookings] — Cancelar agendamento (admin override)

- **File:** `src/components/appointment/AppointmentActions.tsx` (line ~50–173)
- **Function:** `handleCancelAppointment()`
- **Trigger:** AlertDialog confirm button (used in `pages/AdminAppointments.tsx` and client-facing `Appointments.tsx` / `AppointmentCard`)
- **Supabase call:**
  - Admin path (`isAdminOverride`): `supabase.rpc('admin_cancel_appointment', { p_appointment_id })` (~146–149)
  - Standard path: `supabase.rpc('atomic_cancel_appointment', { p_appointment_id, p_appointment_date, p_slots_to_revert, p_staff_ids })` (~152–158)
- **Data available:** `appointmentId`, `isAdmin` from `useAuth`, computed slot list
- **Success handling:** `toast.success`, `onCancel?.()` callback (~163–165)
- **Suggested log entry:** `"Agendamento cancelado"` + `link_type: 'booking'` + `link_id: appointmentId`; include metadata `{ isAdminOverride: true/false }`
- **Notes:** This component is shared between admin and client flows. Guard the log call with `isAdmin` check to avoid logging client cancellations.

---

### [Bookings] — Confirmar agendamento (status → confirmed)

- **File:** `src/components/appointment/AppointmentActions.tsx` (line ~175–206)
- **Function:** `handleConfirmAppointment()`
- **Trigger:** Confirm dialog button (in admin-facing appointment views)
- **Supabase call:** `supabase.from('appointments').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', appointmentId)` (~181–187)
- **Data available:** `appointmentId`
- **Success handling:** `toast.success`, `onConfirm?.()` (~196–198)
- **Suggested log entry:** `"Agendamento confirmado"` + `link_type: 'booking'` + `link_id: appointmentId`
- **Notes:** Guard with `isAdmin` if shared with client flow.

---

### [Bookings] — Aprovar / rejeitar agendamento pendente

- **File:** `src/components/admin/PendingApprovalsSection.tsx` (line ~100–176)
- **Function:** `handleApproval(appointmentId, newStatus: 'confirmed' | 'rejected')`
- **Trigger:** "Aprovar" / "Rejeitar" buttons in pending approvals card
- **Supabase call:**
  - `supabase.from('appointments').update({ status: newStatus, updated_at }).eq('id', appointmentId)` (~104–110)
  - If rejected: additional loop `supabase.from('staff_availability').update({ available: true })` per slot (~158–163)
- **Data available:** Pending appointment row (id, date, time, duration, staff links); `newStatus`
- **Success handling:** `toast`, `fetchPendingAppointments()` (~170–171)
- **Suggested log entry:** `"Agendamento aprovado"` or `"Agendamento rejeitado"` (based on `newStatus`) + `link_type: 'booking'` + `link_id: appointmentId`
- **Notes:** Log AFTER the primary `appointments.update` resolves. Slot revert is a side effect, not a separate admin action to log.

---

### [Bookings] — Alterar status do serviço no agendamento (seção admin)

- **File:** `src/components/admin/ServiceStatusSection.tsx` (line ~82–131)
- **Function:** `updateServiceStatus(newStatus: string)`
- **Trigger:** UI control on admin dashboard section (status chip/button)
- **Supabase call:** Reads `appointment_services`; then per row `supabase.rpc('mark_appointment_service_status', { _appointment_id, _service_id, _status, _force: false })` (~96–101)
- **Data available:** `appointmentId` (from props/state), `newStatus`
- **Success handling:** Local state update, `toast.success` (~120)
- **Suggested log entry:** `"Status do serviço atualizado"` + `link_type: 'booking'` + `link_id: appointmentId`; include `{ newStatus }` in metadata

---

### [Bookings] — Alterar status do serviço no agendamento (dropdown)

- **File:** `src/components/appointments/ServiceStatusDropdown.tsx` (line ~44–80)
- **Function:** `confirmChange(next: string)`
- **Trigger:** Dropdown confirm (used on `AdminAppointments` and `AppointmentCard`)
- **Supabase call:** `appointment_services` select + `supabase.rpc('mark_appointment_service_status', { _appointment_id, _service_id, _status })` per service (~59–66)
- **Data available:** `appointmentId`, `next` status; optional `refetchAppointments`
- **Success handling:** `setStatus`, `refetchAppointments?.()`, `toast` (~69–71)
- **Suggested log entry:** `"Status do serviço atualizado"` + `link_type: 'booking'` + `link_id: appointmentId`; include `{ newStatus: next }`
- **Notes:** This is a second call site for the same RPC as `ServiceStatusSection`. Both must be logged.

---

### [Bookings] — Salvar cobrança adicional / add-ons pós-agendamento

- **File:** `src/pages/AdminBookingSuccess.tsx` (line ~268–331)
- **Function:** `handleSave()`
- **Trigger:** "Salvar" button on post-booking add-ons/extra-fee page
- **Supabase calls:**
  - If extra fee: `supabase.from('appointments').update({ total_price: calculateTotal(), notes: … }).eq('id', appointmentId)` (~275–283)
  - If addons: `supabase.from('appointment_addons').insert([…])` (~302–304); rows include `{ appointment_id, addon_id, added_by: user.id }`
- **Data available:** `appointmentId` (from navigation state), `extraFee`, `extraFeeReason`, `selectedAddons`, `user.id`
- **Success handling:** `toast` (~314–317), `navigate('/admin/appointments')` (~319–320)
- **Suggested log entry:** `"Cobranças adicionais salvas"` + `link_type: 'booking'` + `link_id: appointmentId`; include `{ hasExtraFee, addonCount: selectedAddons.length }`
- **Notes:** This runs immediately after `create_unified_admin_booking` (via navigate). It is a separate log entry from booking creation.

---

## Category 2 — Clients

---

### [Clients] — Criar cliente

- **File:** `src/pages/AdminClients.tsx` (line ~577–715)
- **Function:** `handleCreateClient()`
- **Trigger:** Create client modal submit button
- **Supabase call:** `supabase.from('clients').insert(clientDataToInsert).select().single()` (~620–624)
- **Data available:** `formData` (name, email, phone, address, notes, location, channels, emergency contacts, birth date), `user.id`, `admin_created: true`, `needs_registration`
- **Follow-up:** Optional `supabase.functions.invoke('send-client-invite', …)` (~639–647)
- **Success handling:** Toasts, `fetchClients()` (~710)
- **Return value:** Inserted client row with `id`
- **Suggested log entry:** `"Cliente criado"` + `link_type: 'client'` + `link_id: newClient.id`
- **Notes:** Log AFTER the insert resolves. Invite email send is a side effect, not a separate action to log.

---

### [Clients] — Editar cliente

- **File:** `src/pages/AdminClients.tsx` (line ~717–761)
- **Function:** `handleEditClient()`
- **Trigger:** Edit client modal submit button
- **Supabase call:** `supabase.from('clients').update({ … }).eq('id', selectedClient.id)` (~724–745)
- **Data available:** `formData`, `selectedClient.id`, `clientBirthDate`
- **Success handling:** `toast`, close modal, `fetchClients()` (~752–756)
- **Suggested log entry:** `"Cliente editado"` + `link_type: 'client'` + `link_id: selectedClient.id`

---

### [Clients] — Excluir cliente

- **File:** `src/pages/AdminClients.tsx` (line ~763+)
- **Function:** `handleDeleteClient(clientId)`
- **Trigger:** Delete control on client list
- **Supabase call:** `supabase.rpc('delete_client_completely', { _client_id: clientId })` (~772); optional edge function `delete-staff-user` for auth cleanup (~790)
- **Data available:** `clientId`; RPC returns optional user id/email snapshot
- **Success handling:** Toasts, list refresh
- **Suggested log entry:** `"Cliente excluído"` + `link_type: 'client'` + `link_id: clientId`
- **Notes:** Log AFTER the RPC resolves. This is a hard delete (cascade). Include `{ hadAuthUser: true/false }` in metadata if auth cleanup was triggered.

---

### [Clients] — Editar cliente (inline no agendamento manual)

- **File:** `src/pages/AdminManualBooking.tsx` (line ~522–560)
- **Function:** `saveClientEdit()`
- **Trigger:** "Salvar" in inline client editor dialog on the manual booking page
- **Supabase call:** `supabase.from('clients').update(clientPayload).eq('id', clientEdit.id)` (~543–546)
- **Data available:** `clientEdit` form (name, email, phone, address, notes, location, channels, emergency contacts, marketing opt-in, birth date), `clientEdit.id`
- **Success handling:** Local state update, `toast`, close dialog (~548–556)
- **Suggested log entry:** `"Cliente editado"` + `link_type: 'client'` + `link_id: clientEdit.id`
- **Notes:** This is a second edit path for the same `clients` table. Must be logged independently.

---

### [Clients] — Limpar clientes órfãos (manutenção)

- **File:** `src/pages/AdminClients.tsx` (line ~396–449)
- **Function:** `handleCleanupOrphanedClients()`
- **Trigger:** Maintenance button + `window.confirm`
- **Supabase call:** `supabase.rpc('cleanup_orphaned_clients', { _delete_orphaned: false })` (~426) (links repair, not full row delete)
- **Data available:** None beyond auth user
- **Success handling:** Toast + summary from RPC result
- **Suggested log entry:** `"Limpeza de clientes órfãos executada"` + no `link_id`
- **Notes:** Low priority for audit logging but notable as a bulk mutation.

---

### [Clients] — Limpar duplicatas de clientes/staff (manutenção)

- **File:** `src/pages/AdminClients.tsx` (line ~452–498)
- **Function:** `handleCleanupStaffDuplicates()`
- **Trigger:** Maintenance button + `window.confirm`
- **Supabase call:** `supabase.rpc('cleanup_staff_client_duplicates', { _dry_run: false })` (~482)
- **Data available:** None beyond auth user
- **Success handling:** Toast + summary
- **Suggested log entry:** `"Limpeza de duplicatas staff/cliente executada"` + no `link_id`

---

## Category 3 — Pets

---

### [Pets] — Criar pet (página AdminPets)

- **File:** `src/pages/AdminPets.tsx` (line ~229–268)
- **Function:** `handleCreatePet()`
- **Trigger:** Create pet modal submit button
- **Supabase call:** `supabase.from('pets').insert({ name, breed_id, client_id, size, birth_date, notes, … })` (~241–252)
- **Data available:** `formData`, `birthDate`, `selectedBreed`, `client_id`
- **Success handling:** `toast`, modals reset, `searchPets()` (~260–264)
- **Return value:** No `.select()` here — pet id NOT returned. A `.select().single()` must be added before `link_id` can be populated.
- **Suggested log entry:** `"Pet criado"` + `link_type: 'pet'` + `link_id: newPet.id` (requires adding `.select().single()`)
- **Notes:** **No success callback returns the new id** — 17-B must add `.select().single()` to capture `link_id`.

---

### [Pets] — Editar pet (página AdminPets)

- **File:** `src/pages/AdminPets.tsx` (line ~270–320)
- **Function:** `handleEditPet()`
- **Trigger:** Edit pet modal submit button
- **Supabase call:** `supabase.from('pets').update(updateData).eq('id', selectedPet.id)` (~299–302)
- **Data available:** Same shape as create; `selectedPet.id`
- **Success handling:** `toast`, modals, `searchPets()` (~310–315)
- **Suggested log entry:** `"Pet editado"` + `link_type: 'pet'` + `link_id: selectedPet.id`

---

### [Pets] — Excluir pet (página AdminPets)

- **File:** `src/pages/AdminPets.tsx` (line ~322–341)
- **Function:** `handleDeletePet(petId)`
- **Trigger:** Delete control per pet row
- **Supabase call:** `supabase.from('pets').delete().eq('id', petId)` (~324–327)
- **Data available:** `petId`
- **Success handling:** `toast`, `searchPets()` (~335–336)
- **Suggested log entry:** `"Pet excluído"` + `link_type: 'pet'` + `link_id: petId`

---

### [Pets] — Criar pet (página AdminClients)

- **File:** `src/pages/AdminClients.tsx` (line ~1067–1103)
- **Function:** `handleCreatePet()`
- **Trigger:** "Criar pet" button inside client detail / pets modal
- **Supabase call:** `supabase.from('pets').insert({ … }).select().single()` (~1074–1086)
- **Data available:** `petFormData`, `selectedClientForPets.id`, `selectedBreed`, `petBirthDate`
- **Success handling:** `toast`, refresh pets + `fetchClients()` (~1094–1098)
- **Return value:** New pet row with `id` (`.single()` returns it)
- **Suggested log entry:** `"Pet criado"` + `link_type: 'pet'` + `link_id: newPet.id`
- **Notes:** Second creation path for pets (from client detail page). Log independently.

---

### [Pets] — Editar pet (inline no agendamento manual)

- **File:** `src/pages/AdminManualBooking.tsx` (line ~600–635)
- **Function:** `savePetEdit()`
- **Trigger:** "Salvar" in pet editor dialog on the manual booking page
- **Supabase call:** `supabase.from('pets').update(payload).eq('id', petEdit.id)` (~613–616); optional follow-up select on pets (~621)
- **Data available:** `petEdit` (name, age, client_id, notes, size, birth_date, breed_id, breed text), `petEdit.id`
- **Success handling:** `loadPets`, selected pet refresh, `toast` (~618–631)
- **Suggested log entry:** `"Pet editado"` + `link_type: 'pet'` + `link_id: petEdit.id`
- **Notes:** Third edit path for pets. Must be logged independently.

---

## Category 4 — Pricing / Config

---

### [Config] — Salvar precificação de serviço (por raça/porte)

- **File:** `src/pages/EditServicePricing.tsx` (line ~176–218)
- **Function:** `handleSavePricing()`
- **Trigger:** Save pricing form submit
- **Supabase call:** `service_pricing` **update** (~194–197) if row exists; else **insert** (~203–205); fields include `service_id`, `breed_id`, `size`, `price`, `duration_override`
- **Data available:** `serviceId`, selected breed/size combination, `price`, `duration`
- **Success handling:** `toast`, `handleBreedSizeSelection()` refresh (~212)
- **Suggested log entry:** `"Preço de serviço atualizado"` + `link_type: 'service'` + `link_id: serviceId`; include `{ breed_id, size, newPrice }`

---

### [Config] — Editar campos base do serviço

- **File:** `src/pages/EditServicePricing.tsx` (line ~262–302)
- **Function:** `saveServiceChanges()`
- **Trigger:** "Salvar" after editing base service fields
- **Supabase call:** `supabase.from('services').update({ base_price, default_duration, description }).eq('id', serviceId)` (~279–282)
- **Data available:** `serviceId`, updated `base_price`, `default_duration`, `description`
- **Success handling:** `fetchService()`, `toast` (~293–295)
- **Suggested log entry:** `"Serviço editado"` + `link_type: 'service'` + `link_id: serviceId`

---

### [Config] — Criar serviços de teste

- **File:** `src/components/CreateTestServices.tsx` (line ~60–68)
- **Function:** `createTestServices()`
- **Trigger:** "Criar Serviços de Teste" button (dev/test tooling)
- **Supabase call:** `supabase.from('services').upsert(services, { onConflict: 'id' })` (~62–65)
- **Data available:** Hard-coded test service rows
- **Success handling:** `toast` (~68)
- **Suggested log entry:** `"Serviços de teste criados (upsert)"` + no `link_id`
- **Notes:** Low-priority / dev-only. Consider skipping logging here.

---

### [Config] — Criar funcionário (staff)

- **File:** `src/pages/AdminSettings.tsx` (line ~290–452)
- **Function:** `handleCreateStaff()`
- **Trigger:** Create staff modal submit
- **Supabase call:** `supabase.from('staff_profiles').insert({ … })` (~323–338); invite sent via edge function `fetch`
- **Data available:** `staffFormData` (name, role, bio, etc.), `user.id`
- **Success handling:** Toasts, modal close, `fetchStaff()` (~426–430)
- **Return value:** Inserted staff row; `.select()` usage should be verified for id availability
- **Suggested log entry:** `"Funcionário criado"` + `link_type: 'staff'` + `link_id: newStaff.id`

---

### [Config] — Editar funcionário (staff)

- **File:** `src/pages/AdminSettings.tsx` (line ~454–494)
- **Function:** `handleEditStaff()`
- **Trigger:** Edit staff modal submit
- **Supabase call:** `supabase.from('staff_profiles').update({ … }).eq('id', selectedStaff.id)` (~462–475)
- **Data available:** `selectedStaff.id`, updated fields
- **Success handling:** `toast`, `fetchStaff()` (~485–489)
- **Suggested log entry:** `"Funcionário editado"` + `link_type: 'staff'` + `link_id: selectedStaff.id`

---

### [Config] — Remover funcionário (staff)

- **File:** `src/pages/AdminSettings.tsx` (line ~496+)
- **Function:** `handleRemoveStaff(staffId)`
- **Trigger:** "Remover funcionário" control (branches on active vs. inactive)
- **Supabase call:** `supabase.rpc('remove_staff_completely', { p_staff_id: staffId })` (~515–517); optional fallback `admin_delete_auth_user` RPC (~545) + edge `delete-staff-user`
- **Data available:** `staffId`, user id/email snapshot
- **Success handling:** Toasts, delayed `fetchStaff()` (~599)
- **Suggested log entry:** `"Funcionário removido"` + `link_type: 'staff'` + `link_id: staffId`

---

### [Config] — Atualizar disponibilidade de funcionário (slots em lote)

- **File:** `src/pages/AdminAvailabilityManager.tsx` (line ~115–130)
- **Function:** `updateSlots(slotKeys, available)`
- **Trigger:** Click on schedule anchor (`toggleAnchorAvailability` ~185)
- **Supabase call:** `supabase.from('staff_availability').update({ available }).in('time_slot', slotKeys)` (batch update)
- **Data available:** `slotKeys` array, `available` boolean, staff id from context
- **Success handling:** Local state update
- **Suggested log entry:** `"Disponibilidade de funcionário atualizada"` + `link_type: 'staff'` + `link_id: staffId`; include `{ slotsAffected: slotKeys.length }`
- **Notes:** No toast or explicit success callback currently — one must be added before logging.

---

### [Config] — Gerar disponibilidade de funcionário

- **File:** `src/pages/AdminAvailabilityManager.tsx` (line ~208–235)
- **Function:** `generateAvailabilityForStaff()`
- **Trigger:** "Gerar disponibilidade" action button
- **Supabase call:** `supabase.from('staff_availability').upsert(batch)` in batches (~222–224)
- **Data available:** Staff id, date range, generated slot grid
- **Success handling:** Local state; verify if toast exists
- **Suggested log entry:** `"Disponibilidade gerada para funcionário"` + `link_type: 'staff'` + `link_id: staffId`

---

### [Config] — Alternar slot de disponibilidade individual

- **File:** `src/pages/AdminAvailabilityManager.tsx` (line ~237–254)
- **Function:** `toggleSlotAvailability(slotId)`
- **Trigger:** Toggle on individual slot row
- **Supabase call:** `supabase.from('staff_availability').update({ available: !current }).eq('id', slotId)` (~239–242)
- **Data available:** `slotId`, current `available` value, staff id
- **Success handling:** Local state update
- **Suggested log entry:** `"Slot de disponibilidade alternado"` + `link_type: 'staff'` + `link_id: staffId`
- **Notes:** High frequency action — consider debouncing or batching log calls.

---

## Cross-Cutting Notes

### Actions with NO success callback (need one before logging)
| File | Function | Issue |
|------|----------|-------|
| `pages/AdminAvailabilityManager.tsx` | `updateSlots` | No toast/callback — add one |
| `pages/AdminAvailabilityManager.tsx` | `generateAvailabilityForStaff` | Verify if toast exists |
| `pages/AdminEditBooking.tsx` | `applyPendingStaffChanges` | Function not wired into save flow |

### Actions where `link_id` requires adding `.select().single()`
| File | Function | Problem |
|------|----------|---------|
| `pages/AdminPets.tsx` | `handleCreatePet` | Insert has no `.select()` — new pet id not returned |
| `pages/AdminSettings.tsx` | `handleCreateStaff` | Verify if `.select()` exists on insert |

### Shared components used in both admin and client paths
| Component | Admin guard needed? |
|-----------|-------------------|
| `AppointmentActions.tsx` — `handleCancelAppointment` | Yes — guard with `isAdmin` |
| `AppointmentActions.tsx` — `handleConfirmAppointment` | Yes — verify if client can trigger this |
| `ServiceStatusDropdown.tsx` — `confirmChange` | Verify — used in both `AdminAppointments` and `AppointmentCard` |

### Key RPC summary
| RPC | Location | Purpose |
|-----|----------|---------|
| `create_unified_admin_booking` | `AdminManualBooking` | Primary manual booking creation |
| `create_admin_booking_with_dual_services` | `AdminBookingPage` | Booking via review flow |
| `create_booking_admin` | `adminBookingUtils.ts` | Legacy single-service (likely unused) |
| `edit_admin_booking_with_dual_services` | `AdminEditBooking`, `EditBookingDialog` | Edit with dual services |
| `edit_booking_admin` | `AdminEditBooking`, `EditBookingDialog` | Edit single-service |
| `update_service_staff_assignment` | `AdminEditBooking` | Staff swap (not wired) |
| `admin_cancel_appointment` | `AppointmentActions` | Admin override cancel |
| `atomic_cancel_appointment` | `AppointmentActions` | Standard cancel |
| `mark_appointment_service_status` | `ServiceStatusSection`, `ServiceStatusDropdown` | Service status change |
| `delete_client_completely` | `AdminClients` | Hard delete client (cascade) |
| `cleanup_orphaned_clients` | `AdminClients` | Maintenance |
| `cleanup_staff_client_duplicates` | `AdminClients` | Maintenance |
| `remove_staff_completely` | `AdminSettings` | Hard delete staff |
| `admin_delete_auth_user` | `AdminSettings` | Auth user deletion fallback |

### No `src/api/` folder found
All mutations are in `src/pages/`, `src/components/`, and `src/utils/`.

---

*Audit complete. No code was modified. Report generated for use by prompt 17-B.*
