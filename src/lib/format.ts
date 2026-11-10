import type { ActionStatus, AppRole, Priority, RiskLevel, WorkflowEvent } from './types';

export const STATUS_LABEL: Record<ActionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  in_progress: 'In progress',
  pending_verification: 'Pending verification',
  effectiveness_review: 'Effectiveness review',
  pending_closure: 'Pending closure',
  closed: 'Closed',
  rejected: 'Rejected',
};
export const STATUS_ORDER: ActionStatus[] = [
  'draft', 'submitted', 'approved', 'in_progress', 'pending_verification',
  'effectiveness_review', 'pending_closure', 'closed', 'rejected',
];
export const OPEN_STATUSES: ActionStatus[] = ['draft', 'submitted', 'approved', 'in_progress'];

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const RISK_LABEL: Record<RiskLevel, string> = { low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very high' };

export const ROLE_LABEL: Record<AppRole, string> = {
  administrator: 'Administrator',
  quality_manager: 'Quality Manager',
  department_manager: 'Department Manager',
  action_owner: 'Action Owner',
  assigned_staff: 'Assigned Staff',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
};
export const ROLE_HELP: Record<AppRole, string> = {
  administrator: 'Manages users, roles, departments and reference lists. Cannot approve, verify or close actions.',
  quality_manager: 'Approves, verifies, closes and reopens actions; maintains approval policy.',
  department_manager: 'Creates and approves actions for one department; extends deadlines and reassigns there.',
  action_owner: 'Creates actions and can be named as the person accountable for one.',
  assigned_staff: 'Can be assigned to actions, comment and flag blocks.',
  reviewer: 'Verifies implementation and evaluates effectiveness (never for own work).',
  viewer: 'Read-only access to every action.',
};

interface EventMeta {
  label: string;
  tone: 'primary' | 'neutral' | 'danger' | 'success';
  commentRequired: boolean;
  commentLabel: string;
  help: string;
}
export const EVENT_META: Record<WorkflowEvent, EventMeta> = {
  submit: { label: 'Submit', tone: 'primary', commentRequired: false, commentLabel: 'Note (optional)',
    help: 'The approval policy is applied now. If approval is not required the action becomes Approved immediately.' },
  approve: { label: 'Approve', tone: 'success', commentRequired: false, commentLabel: 'Approval note (optional)',
    help: 'Authorizes the plan for execution.' },
  return: { label: 'Return for revision', tone: 'neutral', commentRequired: true, commentLabel: 'What must be revised',
    help: 'Sends the action back to Draft so the creator or owner can revise it.' },
  reject: { label: 'Reject', tone: 'danger', commentRequired: true, commentLabel: 'Reason for rejection',
    help: 'Rejected is final. The action can no longer be edited or progressed.' },
  start: { label: 'Start work', tone: 'primary', commentRequired: false, commentLabel: 'Note (optional)',
    help: 'Marks the action as In progress. Start date defaults to today if empty.' },
  block: { label: 'Flag as blocked', tone: 'neutral', commentRequired: true, commentLabel: 'What is blocking progress',
    help: 'The action stays In progress but is flagged as blocked until unblocked.' },
  unblock: { label: 'Remove block', tone: 'neutral', commentRequired: false, commentLabel: 'Note (optional)',
    help: 'Clears the blocked flag.' },
  submit_verification: { label: 'Submit for verification', tone: 'primary', commentRequired: false, commentLabel: 'Note (optional)',
    help: 'Declares implementation complete. A reviewer who did not perform the work will verify it.' },
  verify_pass: { label: 'Verification passed', tone: 'success', commentRequired: true, commentLabel: 'Verification result (what you checked)',
    help: 'Confirms the action was implemented as planned. Next: effectiveness review (if required) or closure.' },
  verify_fail: { label: 'Verification failed', tone: 'danger', commentRequired: true, commentLabel: 'What was not implemented',
    help: 'Returns the action to In progress.' },
  effectiveness_pass: { label: 'Effective', tone: 'success', commentRequired: true, commentLabel: 'Effectiveness result (evidence the target was met)',
    help: 'Confirms the measurable target was achieved. Next: formal closure by the quality manager.' },
  effectiveness_fail: { label: 'Not effective', tone: 'danger', commentRequired: true, commentLabel: 'Why the action was not effective',
    help: 'Returns the action to In progress for further work.' },
  close: { label: 'Authorize closure', tone: 'success', commentRequired: false, commentLabel: 'Closure note (optional)',
    help: 'Formal closure. The record becomes read-only.' },
  reopen: { label: 'Reopen', tone: 'danger', commentRequired: true, commentLabel: 'Justification for reopening',
    help: 'Returns a closed action to In progress.' },
};
export const DECISION_LABEL: Record<string, string> = {
  ...Object.fromEntries(Object.entries(EVENT_META).map(([k, v]) => [k, v.label])),
  reassign: 'Reassigned owner',
  extend_deadline: 'Deadline extended',
  assign_staff: 'Staff assignment changed',
};

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh',
  });
}
export function riskLevel(l: number, s: number): RiskLevel {
  const x = l * s;
  return x >= 20 ? 'very_high' : x >= 10 ? 'high' : x >= 5 ? 'medium' : 'low';
}
