# Workflow rules — Action Plan Control (Phase 1)

All status changes go through one database function, `action_transition()`. The same function
(`action_event_denial()`) decides which buttons the app shows, so the screen and the database cannot disagree.
Direct edits of `status` and other workflow fields are rejected by a trigger for every user.

## Lifecycle

Main path:

1. **Draft** → *submit* → **Submitted** (or straight to **Approved** when policy does not require approval)
2. **Submitted** → *approve* → **Approved**  ·  *return* → back to **Draft**  ·  *reject* → **Rejected** (final)
3. **Approved** → *start* → **In progress**
4. **In progress** → *submit for verification* → **Pending verification**
5. **Pending verification** → *verification passed* → **Effectiveness review** (or **Pending closure** if the category
   needs no effectiveness review)  ·  *verification failed* → back to **In progress**
6. **Effectiveness review** → *effective* → **Pending closure**  ·  *not effective* → back to **In progress**
7. **Pending closure** → *authorize closure* → **Closed**
8. **Closed** → *reopen* (with justification) → **In progress**

`Blocked` is a flag on an Approved or In-progress action, not a status, so the action keeps its place in the workflow.
`Pending closure` was added between effectiveness review and closure so that **verification, effectiveness and formal
closure are three separate, attributable decisions**.

## Transition matrix

| Event | From | To | Who may do it | Never allowed for | Must exist first | Comment |
|---|---|---|---|---|---|---|
| submit | Draft | Submitted, or Approved if policy does not require approval | Creator, owner, department manager, QM | — | Description ≥ 10 chars, measurable target, due date not in past | Optional |
| approve | Submitted | Approved | QM, department manager of the action's department | Creator, owner | — | Optional |
| return | Submitted | Draft | QM, department manager | Creator, owner | — | **Required** |
| reject | Submitted | Rejected (final) | QM, department manager | Creator, owner | — | **Required** |
| start | Approved | In progress | Owner, QM | — | Start date set to today if empty | Optional |
| block | Approved / In progress | (same, flagged) | Owner, assigned staff, department manager, QM | — | Not already blocked | **Required** (reason) |
| unblock | blocked | (same) | Owner, assigned staff, department manager, QM | — | — | Optional |
| submit_verification | In progress | Pending verification | Owner, QM | — | Not blocked; implementation summary ≥ 10 chars | Optional |
| verify_pass | Pending verification | Effectiveness review, or Pending closure if not required | Reviewer, QM | Owner, assigned staff, person who submitted for verification | — | **Required** (verification result) |
| verify_fail | Pending verification | In progress | Reviewer, QM | as above | — | **Required** |
| effectiveness_pass | Effectiveness review | Pending closure | Reviewer, QM | Owner, assigned staff | — | **Required** (evidence target met) |
| effectiveness_fail | Effectiveness review | In progress | Reviewer, QM | Owner, assigned staff | — | **Required** |
| close | Pending closure | Closed | QM only | Owner | — | Optional |
| reopen | Closed | In progress | QM only | — | — | **Required** |
| reassign (owner) | any open status | (same) | QM, department manager | — | New owner holds an owner-eligible role | **Required** |
| extend deadline | Submitted → Effectiveness review | (same) | QM, department manager | Owner | New date ≠ current; original due date kept | **Required** |

“Required” comments must meet the minimum length set in *Approval policy* (default 15 characters).
QM = quality manager. Administrators have **no** workflow authority unless they also hold a quality role.

## Approval policy

At submission the system records `requires_approval = true` when **any** of these holds:
1. the category is flagged “always needs approval” (defaults: Corrective action, Audit follow-up);
2. priority ≥ the policy threshold (default High);
3. risk level (likelihood × severity) ≥ the policy threshold (default High = score 10–19; Very high = 20–25).

`requires_effectiveness` is copied from the category (default: every category except Routine operational action).
Both values are **snapshots** — changing policy later does not silently change actions already submitted.

## Field locking after submission

| Field group | Draft | After submission |
|---|---|---|
| Status, approval, verification, closure fields | workflow only | workflow only |
| Owner, due date | editable | only via **Reassign** / **Extend deadline** (justification recorded) |
| Category, department, priority, likelihood, severity | editable | quality manager only |
| Title, description, target, QSE, source, ISO clauses | editable | quality manager or department manager |
| Implementation summary, start date, effectiveness review date | — | owner (Approved / In progress), managers |
| Anything | — | nothing once Closed or Rejected |

## Overdue

An action is **overdue** when it is Draft, Submitted, Approved or In progress and its due date is before today in the
laboratory time zone (Asia/Phnom_Penh). Once submitted for verification it is no longer counted as overdue
(implementation is complete). “Due soon” uses the window set in *Approval policy* (default 7 days).
