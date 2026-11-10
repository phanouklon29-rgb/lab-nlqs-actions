# User guide — LAB NLQS Action Plan Control (Phase 1)

## Roles at a glance

| Role | Can do | Cannot do |
|---|---|---|
| Administrator | Manage users, roles, departments, reference lists | Approve, verify, close; change own roles |
| Quality Manager | Everything in the workflow; edit approval policy; edit any open action | Approve/verify/close actions they own or created |
| Department Manager (per department) | Create, edit, approve, reassign, extend deadlines in their department | Approve their own actions; act outside their department |
| Action Owner | Create actions; run actions they own; update implementation summary | Approve or verify own actions; change due date after submission |
| Assigned Staff | See assigned actions, comment, flag blocked/unblocked | Change the plan or status |
| Reviewer | Verify implementation; evaluate effectiveness | Review work they own, are assigned to, or submitted |
| Viewer | Read every action, history and audit trail | Change anything |

A person can hold several roles. The segregation-of-duties rules apply per action, so a quality manager who owns an
action needs a second person to approve, verify and close it.

---

## Administrator

**Add a user**
1. Supabase dashboard → *Authentication → Users → Invite user* → enter the email.
2. The person receives an email, clicks the link and sets a password in the app.
3. In the app → *Users & roles* → *Manage* → set department → *Grant a role*.
   Department Manager requires choosing the department.

**Remove access** — use *Deactivate*. Do not delete users in Supabase: their name is linked to audit records,
and the database will refuse the deletion.

**Departments** — add with a short code (HEM, CHEM, MICRO, BB, QA…). Deactivate instead of deleting.

**Reference lists** — Sources, QSE names and ISO clauses can be renamed, added or deactivated. Category flags are
policy and are normally maintained by the quality manager.

---

## Quality manager

**Approval policy** (*Approval policy* page): set the priority and risk thresholds that force approval, the
“due soon” window, and the minimum justification length. Category flags (*Reference lists → Action categories*) decide
which categories always need approval and which need an effectiveness review.

**Daily routine** — open *My work*: approvals, verifications, effectiveness reviews and closures waiting for you.

**Closing an action** — only possible after verification (and effectiveness review where required). Check the
decision history and audit trail tabs before authorizing closure. The record then becomes read-only.

**Reopening** — use when a closed action's problem recurs (e.g. found at internal audit). A justification is required;
the reopen count appears in the register and export.

---

## Action owners and staff

**Create an action** — *New action*. Write a measurable target (“zero haemolysed K⁺ rejections for 3 months”,
not “improve sample quality”). The form shows whether approval and effectiveness review will be required.
The action is saved as **Draft**; open it and click **Submit** when ready.

**After approval** — click **Start work**. Record what you did in *Edit → Implementation summary*, including where the
evidence is filed (equipment record number, training record, document number). In Phase 1 evidence files are kept in
your existing records system; Phase 2 adds uploads.

**Blocked?** — click **Flag as blocked** and state the reason. The flag is visible in the register and on My work.
Remove it when work can continue.

**Need more time?** — ask your department manager or quality manager to **Extend deadline**. Owners cannot extend their
own deadlines; the original due date is always kept.

**Finished** — **Submit for verification**. A reviewer who did not do the work will check it.

**Comments** — use for progress notes. Comments cannot be edited or deleted.

---

## Reviewers

- **Verification** checks the action was *implemented as planned* (evidence exists, records updated).
  Write what you checked in the result.
- **Effectiveness review** checks the *target was achieved* using the data named in “How effectiveness will be checked”.
  If the effectiveness review date has not arrived, leave the action in Effectiveness review — do not pass it early.
- Choose *not effective* / *verification failed* with a clear reason when the target or evidence is not met; the action
  returns to In progress.

---

## Register and export

- Search covers action ID, title, description and owner.
- Filters can be combined; the URL keeps them, so you can bookmark “Overdue in Haematology”.
- **Export to Excel** exports every row matching the current filters (not just the visible page), with all register
  fields, the filters used, who exported it and when.
