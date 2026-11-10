export type AppRole =
  | 'administrator' | 'quality_manager' | 'department_manager'
  | 'action_owner' | 'assigned_staff' | 'reviewer' | 'viewer';

export type ActionStatus =
  | 'draft' | 'submitted' | 'approved' | 'in_progress'
  | 'pending_verification' | 'effectiveness_review' | 'pending_closure'
  | 'closed' | 'rejected';

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high' | 'very_high';

export type WorkflowEvent =
  | 'submit' | 'approve' | 'return' | 'reject' | 'start' | 'block' | 'unblock'
  | 'submit_verification' | 'verify_pass' | 'verify_fail'
  | 'effectiveness_pass' | 'effectiveness_fail' | 'close' | 'reopen';

export interface Department { id: string; code: string; name: string; active: boolean }
export interface Profile {
  id: string; email: string; full_name: string; job_title: string | null;
  department_id: string | null; active: boolean;
}
export interface UserRole { id: string; user_id: string; role: AppRole; department_id: string | null; granted_at: string }
export interface Lookup { id: string; code: string; name: string; active: boolean; sort_order: number }
export interface Category extends Lookup {
  description: string | null;
  requires_approval: boolean; requires_effectiveness: boolean; requires_root_cause: boolean;
}
export interface IsoClause { id: string; standard: string; clause: string; title: string; sort_order: number; active: boolean }
export interface Settings {
  timezone: string; approval_min_priority: Priority | null; approval_min_risk: RiskLevel | null;
  due_soon_days: number; min_justification_len: number;
}

export interface ActionPlan {
  id: string; action_no: string; title: string; description: string;
  category_id: string; source_id: string | null; source_reference: string | null; qse_id: string | null;
  department_id: string; priority: Priority; likelihood: number; severity: number;
  risk_score: number; risk_level: RiskLevel;
  owner_id: string; created_by: string;
  start_date: string | null; due_date: string; original_due_date: string; completion_date: string | null;
  target_outcome: string; success_measure: string | null; implementation_summary: string | null;
  effectiveness_review_date: string | null;
  verification_result: string | null; effectiveness_result: string | null; closure_comment: string | null;
  status: ActionStatus; is_blocked: boolean; blocked_reason: string | null;
  requires_approval: boolean | null; requires_effectiveness: boolean | null;
  submitted_by: string | null; submitted_at: string | null; verification_submitted_by: string | null;
  approved_by: string | null; approved_at: string | null;
  verified_by: string | null; verified_at: string | null;
  effectiveness_by: string | null; effectiveness_at: string | null;
  closed_by: string | null; closed_at: string | null;
  reopened_count: number; version: number; created_at: string; updated_at: string;
}

export interface RegisterRow extends ActionPlan {
  category_code: string; category_name: string; source_name: string | null;
  qse_code: string | null; qse_name: string | null;
  department_code: string; department_name: string;
  owner_name: string; created_by_name: string; closed_by_name: string | null;
  iso_clauses: string | null; assigned_staff: string | null;
  is_overdue: boolean; days_overdue: number; is_due_soon: boolean;
}

export interface Decision {
  id: string; action_id: string; event: string; from_status: ActionStatus; to_status: ActionStatus;
  comment: string | null; details: Record<string, unknown> | null; decided_by: string; decided_at: string;
}
export interface Comment { id: string; action_id: string; author_id: string; body: string; created_at: string }
export interface AuditEvent {
  id: number; occurred_at: string; actor_id: string | null; db_role: string; table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE'; event_type: string | null; changed_fields: string[] | null;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
}
