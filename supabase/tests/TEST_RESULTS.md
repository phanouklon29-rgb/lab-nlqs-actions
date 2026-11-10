# Database test results — Phase 1

Run: 2026-10-26T09:18:41.842Z  ·  Engine: PostgreSQL 18.6 (PGlite 0.5.11) (embedded) with Supabase auth stub
Result: **35/35 passed**

| ID | Test | Result |
|---|---|---|
| T01 | Anonymous users cannot read anything | PASS |
| T02 | Administrator grants roles to others but cannot change own roles | PASS |
| T03 | Department manager role must be scoped to a department | PASS |
| T04 | Non-admin can edit own name but not own department or active flag | PASS |
| T05 | Action owner creates an action; system forces draft status and numbering | PASS |
| T06 | Users without a creating role cannot create; owner must hold an owner-eligible role | PASS |
| T07 | Visibility: outsider and other-department manager cannot see; viewer, dept manager, QM can | PASS |
| T08 | Viewer cannot edit; nobody can set status directly | PASS |
| T09 | Delete is blocked for everyone, including database superuser | PASS |
| T10 | Submit requires a measurable target; corrective action goes to Submitted (approval required) | PASS |
| T11 | Administrator (without quality role) cannot approve; owner cannot approve own action | PASS |
| T12 | Return for revision requires a comment and sends the action back to Draft | PASS |
| T13 | Department manager approves (segregation: not creator, not owner) | PASS |
| T14 | Owner cannot change approved scope, owner or due date directly | PASS |
| T15 | Owner starts the action and assigns staff | PASS |
| T16 | Block requires reason; blocked action cannot go to verification | PASS |
| T17 | Deadline extension: owner refused; dept manager with justification recorded | PASS |
| T18 | Reassignment needs justification and an eligible owner | PASS |
| T19 | Submit for verification requires an implementation summary | PASS |
| T20 | Verification: owner, assigned staff and plain staff refused; reviewer verifies | PASS |
| T21 | Closure is not possible while effectiveness is pending | PASS |
| T22 | Failed effectiveness sends action back to In Progress | PASS |
| T23 | Only quality manager closes; reopen requires justification | PASS |
| T24 | Routine low-risk action skips approval and effectiveness review | PASS |
| T25 | Policy thresholds: critical priority or high risk forces approval even for routine/improvement | PASS |
| T26 | Reject is terminal: no edits, no comments, no transitions | PASS |
| T27 | Concurrent edits: stale version is refused (RPC and direct update) | PASS |
| T28 | Available events reflect role and segregation of duties | PASS |
| T29 | Audit trail records workflow events with user, time and old/new values | PASS |
| T30 | Audit trail is append-only for users AND database superuser | PASS |
| T31 | Audit visibility follows action visibility | PASS |
| T32 | Register view: overdue calculation in laboratory timezone, RLS respected | PASS |
| T33 | Quality manager can change policy settings; administrator cannot | PASS |
| T34 | Deactivated user loses access immediately | PASS |
| T35 | Comments: visible users may comment; author is enforced | PASS |

These tests verify the database rules (RLS, workflow, segregation of duties, audit trail).
They do not replace user acceptance testing on your Supabase project — see docs/UAT_CHECKLIST.md.
