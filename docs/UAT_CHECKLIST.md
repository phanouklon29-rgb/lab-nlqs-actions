# User acceptance test checklist — Phase 1

Run on **your** Supabase project after deployment, with real user accounts. Record result, tester and date.
Keep the signed copy as validation evidence (ISO 15189:2022 7.6 / 8.4).

**Test accounts needed:** ADMIN (administrator), QM (quality manager), DM-HEM (department manager, Haematology),
OWNER-A and OWNER-B (action owner), STAFF (assigned staff), REV (reviewer), VIEW (viewer), DM-CHEM (department manager,
another department).

| # | Test | Steps | Expected result | Pass/Fail | Tester / date |
|---|---|---|---|---|---|
| 1 | Login | Sign in with correct and wrong password | Wrong password refused; correct one opens My work | | |
| 2 | Invitation | Invite a new email; follow link | User sets password; sees “Waiting for access” until a role is granted | | |
| 3 | Password reset | “Forgot password?” | Email received; new password works | | |
| 4 | Admin self-role | ADMIN opens own user → Manage | Role controls hidden; message about segregation | | |
| 5 | Admin has no approval power | ADMIN (without QM) opens a Submitted action | No Approve button | | |
| 6 | Create | OWNER-A creates a Corrective action in HEM | Saved as Draft with number ACT-YYYY-NNNN | | |
| 7 | Submit validation | Submit with empty target | Refused with message | | |
| 8 | Submit | Complete target; Submit | Status Submitted (approval required) | | |
| 9 | Own approval blocked | OWNER-A opens it | No Approve button | | |
| 10 | Return | DM-HEM → Return with reason | Back to Draft; reason in Decisions | | |
| 11 | Approve | Resubmit; DM-HEM → Approve | Status Approved; approver shown | | |
| 12 | Department scope | DM-CHEM searches for it | Not visible | | |
| 13 | Owner locked fields | OWNER-A → Edit after approval | Only implementation fields editable | | |
| 14 | Start & assign | OWNER-A → Start work; assign STAFF | In progress; STAFF sees it under Assigned to me | | |
| 15 | Block | STAFF → Flag as blocked with reason | Blocked badge in register | | |
| 16 | Blocked cannot verify | OWNER-A → Submit for verification | Button not available while blocked | | |
| 17 | Extend deadline | OWNER-A tries; DM-HEM extends with reason | Owner cannot; DM succeeds; original date kept | | |
| 18 | Reassign | DM-HEM reassigns to OWNER-B and back | Recorded in Decisions with justification | | |
| 19 | Verification | Add implementation summary; submit; STAFF (if also reviewer) tries; REV verifies | STAFF refused; REV passes → Effectiveness review | | |
| 20 | Early closure | QM tries to close | Not possible until effectiveness passed | | |
| 21 | Effectiveness fail | REV → Not effective | Back to In progress | | |
| 22 | Full closure | Re-submit, verify, effective; QM closes | Closed; record read-only; no comment box | | |
| 23 | Reopen | QM reopens with justification | In progress; reopen count 1 | | |
| 24 | Routine action | Create Routine/Low; submit | Goes straight to Approved; skips effectiveness review | | |
| 25 | Policy threshold | Routine with Critical priority | Requires approval | | |
| 26 | Reject | Submit an action; QM rejects | Rejected; cannot edit or comment | | |
| 27 | Concurrent edit | Two browsers edit same draft; save both | Second save refused with conflict message | | |
| 28 | Audit trail | Open Audit trail tab on the action from tests 6–23 | Every step shown with user, time, old → new values | | |
| 29 | Audit immutability | In SQL editor: `update audit_events set event_type='x' where id=1;` | Error “append-only” | | |
| 30 | Viewer | VIEW opens register and an action | Can read; no Edit/workflow buttons | | |
| 31 | Overdue | Extend an action's deadline to yesterday… (or wait) | Appears with Overdue badge and filter | | |
| 32 | Excel export | Filter register; Export | File opens; rows match filter; header shows filters and exporter | | |
| 33 | Deactivate | ADMIN deactivates STAFF; STAFF reloads | “Account deactivated” | | |
| 34 | Persistence | Sign out, sign in on another device | All data present | | |
| 35 | Mobile | Open on a phone | Usable; no horizontal page scroll | | |

**Overall result:** ☐ Accepted ☐ Accepted with conditions ☐ Not accepted

Quality manager: ____________________ Signature: __________ Date: __________
