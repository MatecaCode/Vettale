
// ─── Client Notification Types ────────────────────────────────────────────────
export interface ClientNotification {
  id: string;
  client_id: string;
  appointment_id: string | null;
  type: 'booking_approved' | 'service_in_progress' | 'service_completed' | 'review_reminder' | string;
  title: string;
  body: string;
  deep_link: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// ─── Admin Notification Types ─────────────────────────────────────────────────
export interface AdminNotification {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  deep_link: string;
  source: string;
  created_at: string;
  read_at: string | null;
}

// Custom type extensions for Supabase functions not in the auto-generated types
export interface CustomDatabaseFunctions {
  get_admin_notifications: {
    Args: { _limit?: number; _offset?: number };
    Returns: AdminNotification[];
  };
  get_admin_unread_notification_count: {
    Args: Record<string, never>;
    Returns: number;
  };
  mark_admin_notification_read: {
    Args: { _notification_id: string };
    Returns: void;
  };
  mark_all_admin_notifications_read: {
    Args: Record<string, never>;
    Returns: void;
  };
  reduce_availability_capacity: {
    Args: {
      p_resource_type: string;
      p_provider_id: string;
      p_date: string;
      p_time_slot: string;
    };
    Returns: void;
  };

  atomic_cancel_appointment: {
    Args: {
      p_appointment_id: string;
      p_appointment_date: string;
      p_slots_to_revert: string[];
      p_staff_ids: string[];
    };
    Returns: void;
  };

  create_admin_booking_with_addons: {
    Args: {
      _client_user_id: string;
      _pet_id: string;
      _service_id: string;
      _booking_date: string;
      _time_slot: string;
      _calculated_price: number;
      _notes?: string;
      _provider_ids?: string[];
      _extra_fee?: number;
      _extra_fee_reason?: string;
      _addons?: any[];
      _created_by?: string;
    };
    Returns: string;
  };
}

// Composite Service Types
export interface CompositeService {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompositeServiceComponent {
  id: string;
  composite_service_id: string;
  service_id: string;
  order_index: number;
  created_at: string;
}

export interface CompositeServiceWithComponents {
  composite_service_id: string;
  composite_service_name: string;
  composite_service_slug: string;
  composite_service_description: string | null;
  composite_service_active: boolean;
  order_index: number;
  component_service_id: string;
  component_service_name: string;
  component_service_type: 'grooming' | 'veterinary';
  component_base_price: number | null;
  component_default_duration: number | null;
  component_description: string | null;
}

export interface CompositeServiceDetails {
  total_price: number;
  total_duration: number;
  required_roles: string[];
  component_details: Array<{
    service_id: string;
    service_name: string;
    service_type: string;
    base_price: number | null;
    default_duration: number | null;
    final_price: number | null;
    final_duration: number | null;
    order_index: number;
  }>;
}
