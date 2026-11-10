# LAB NLQS · Action Plan Control Management PRO — Phase 1

Multi-user laboratory action management aligned with ISO 15189:2022 and the 12 Quality System Essentials.
React + TypeScript + Vite front end, Supabase (PostgreSQL, Auth) back end, deployable to Vercel.

**Phase 1 (this release)** delivers the core that every later module depends on:

| Included in Phase 1 | Planned for later phases |
|---|---|
| Sign-in, invitations, password reset | Phase 2 — tasks & milestones with weighted progress, evidence file uploads (private Storage), CAPA / root-cause analysis (5 Whys, fishbone) |
| 7 roles with department scoping, Row Level Security on every table | Phase 3 — extended verification/effectiveness evidence linking |
| Action register: search, filter, sort, server-side pagination, Excel export | Phase 4 — scheduled deadline/overdue alerts, escalation, delivery log |
| Create / edit with field locking after submission | Phase 5 — executive dashboard and the nine standard reports (Excel + PDF) |
| Full workflow engine: Draft → Submitted → Approved → In progress → Pending verification → Effectiveness review → Pending closure → Closed, plus Return, Reject, Block, Reassign, Deadline extension, Reopen | Integration with IQC, Document Control, EQA, Internal Audit, Risk modules |
| Approval policy encoded as data (category + priority + risk thresholds) | |
| Segregation of duties enforced in the database | |
| Append-only audit trail (database triggers) with old/new values | |
| Optimistic locking for concurrent edits | |
| “My work” queue, comments, decision history | |

Nothing in the app is a placeholder: every button calls a real database function, and the database
re-checks every permission, so a user cannot bypass a rule by calling the API directly.

---

## 1. Project layout

```
supabase/migrations/   SQL migrations — run in filename order
  20261026000100_core.sql          shared core: departments, profiles, roles, audit trail
  20261026000200_actions.sql       action plans, workflow engine, RLS
  20261026000300_seed_lookups.sql  12 QSEs, ISO 15189:2022 clauses, categories, sources
supabase/tests/        automated database tests (35 tests) + TEST_RESULTS.md
src/                   React application
docs/                  workflow rules, user guides, UAT checklist, operations
```

## 2. Set up Supabase (about 20 minutes)

1. **Create a project** at supabase.com. Choose the Singapore region (closest to Cambodia).
2. **Run the migrations.** Dashboard → *SQL Editor* → paste and run each file from `supabase/migrations/`
   **in filename order** (core → actions → seed). Each runs in a few seconds.
   - The migrations only *create* objects; they never drop or delete. Re-running them is safe.
   - If your project already contains LAB NLQS tables (e.g. IQC), read §6 before running.
3. **Authentication settings** (Dashboard → *Authentication*):
   - *Sign In / Providers → Email*: keep enabled. **Turn off “Allow new users to sign up”** — users are invited.
   - *URL Configuration*: set **Site URL** to your Vercel URL (e.g. `https://lab-nlqs-actions.vercel.app`) and add
     `http://localhost:5173` to *Redirect URLs* for local testing.
4. **Create the first administrator.** *Authentication → Users → Invite user* with your email, accept the invitation,
   then in the SQL Editor run:

   ```sql
   -- replace the email; run as the dashboard (postgres) user
   insert into public.user_roles (user_id, role)
   select id, 'administrator' from public.profiles where email = 'you@example.org';

   -- optional, only if you will ALSO act as quality manager (see note below)
   insert into public.user_roles (user_id, role)
   select id, 'quality_manager' from public.profiles where email = 'you@example.org';
   ```
   > Inside the app, administrators cannot change their own roles. Appoint a second administrator early so roles
   > can be maintained without SQL. For audit purposes it is better that the person administering accounts is not
   > the only quality manager.
5. **Add departments and users** in the app: *Departments*, then invite each person from the Supabase dashboard
   and grant roles in *Users & roles*.
6. **Review policy**: *Reference lists → Action categories* (approval/effectiveness flags) and *Approval policy*
   (priority/risk thresholds). Check the ISO clause titles against your licensed copy of the standard.

## 3. Run locally

```bash
cp .env.example .env        # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Project Settings → API)
npm install
npm run dev                 # http://localhost:5173
```

Use only the **anon (public)** key in the front end. Never put the `service_role` key in `.env` or Vercel.

## 4. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Vercel → *Add New Project* → import the repo. Framework preset: **Vite** (build `npm run build`, output `dist`).
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy, then set the Vercel URL as the Supabase **Site URL** (step 2.3).
5. `vercel.json` already rewrites all paths to `index.html` so deep links work.

Deployment has **not** been performed by the developer — it must be done and verified on your accounts using
`docs/UAT_CHECKLIST.md`.

## 5. Testing

```bash
npm run test:db     # runs all migrations on embedded PostgreSQL 18 and executes 35 rule tests
npm run build       # type-check and production build
```

Latest results: `supabase/tests/TEST_RESULTS.md` (35/35 passed). These prove the database rules; they are not a
substitute for user acceptance testing on your own Supabase project (`docs/UAT_CHECKLIST.md`), which is the
validation evidence an ISO 15189 assessor will expect from the laboratory.

## 6. Integrating with other LAB NLQS modules

- `profiles`, `departments`, `user_roles`, `audit_events` and the `has_role()` / `is_dept_manager_of()` helpers are the
  **shared core**. IQC, Document Control and later modules should use them rather than creating their own user tables.
- Each module writes to the same `audit_events` table with its own `module` name.
- If an existing project already has `profiles` or `departments` with different columns, **stop** and compare
  first. The migrations use `create table if not exists`, so an existing table would be kept as-is and later
  statements could fail. Send the existing schema for a tailored migration rather than altering tables blindly.

## 7. Documentation

- `docs/WORKFLOW.md` — state-transition matrix, who may do what, segregation-of-duties rules
- `docs/USER_GUIDE.md` — administrator, quality manager and staff guide
- `docs/UAT_CHECKLIST.md` — acceptance tests to run and sign on your Supabase project
- `docs/OPERATIONS.md` — backup and recovery, known limitations, security notes
