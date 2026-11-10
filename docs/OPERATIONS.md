# Operations: backup, recovery, limitations, security

## Supabase plan — read before go-live

On the **Free plan** (checked October 2026 — re-check on supabase.com/pricing):
- projects are **paused after about 1 week of low database activity**; a paused project can be resumed from the
  dashboard (data is kept), but the app is unavailable until then;
- **no automatic backups and no point-in-time recovery**;
- 500 MB database and 1 GB file storage per project.

A laboratory quality record system should not depend on a plan with no backups. Use the Free plan for building and
UAT; move to **Pro** (from about USD 25/month, includes daily backups) before the system becomes the official
record, or run the manual backup routine below every week without fail.

## Backup routine (any plan)

1. **Database dump (weekly, and before every migration)** — on a computer with the Supabase CLI:
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db dump --data-only -f backup_$(date +%F)_data.sql
   supabase db dump -f backup_$(date +%F)_schema.sql
   ```
   Store the files on encrypted storage outside Supabase (e.g. the hospital file server). Keep at least 12 weekly copies.
2. **Human-readable copy (monthly)** — Action register → no filters → *Export to Excel*. File it with the monthly quality
   records. This also serves as a fallback if the system is unavailable.
3. **Record the backup** in your backup log (date, file name, who, checksum if possible).

## Recovery

- **Paused project:** dashboard → project → *Resume project*.
- **Restore from dump** into a new project: run the three migrations, then
  `psql "<connection string>" -f backup_YYYY-MM-DD_data.sql`.
  Triggers fire during restore; run the data file as the `postgres` user and, if audit triggers duplicate rows, restore
  with `session_replication_role = replica` (ask a database administrator).
- **Test a restore** into a scratch project at least once before go-live and record the result — an untested backup is
  not a backup.

## Known limitations (Phase 1)

| Limitation | Workaround / plan |
|---|---|
| No file uploads; evidence is described in the implementation summary | Reference record numbers; Phase 2 adds private Storage uploads |
| No tasks or weighted progress | Phase 2 |
| No CAPA root-cause fields | Use description; Phase 2 adds containment, impact, 5 Whys, fishbone |
| No e-mail / scheduled alerts | Use My work and the Overdue filter daily; Phase 4 adds scheduled alerts with delivery log |
| No dashboard or PDF reports | Excel export; Phase 5 |
| Users are invited from the Supabase dashboard, not inside the app | In-app invitations need a server function holding the service key (planned) |
| Audit trail is protected against all application users and against accidental SQL `update/delete/truncate`, but a Supabase owner could still drop the trigger | Restrict dashboard access to 1–2 people; weekly dumps provide an independent copy |
| Changes made in the SQL editor bypass the application rules for reference tables and are recorded with “System” as the user | Do routine work in the app; document any SQL change |
| ISO clause titles are short working titles | Verify against your licensed standard |
| Times shown in ICT (UTC+7); dates calculated in Asia/Phnom_Penh | Change `action_settings.timezone` if needed |

## Security notes

- Only the anon public key is used in the browser. Every table has Row Level Security; there are no policies for
  anonymous users.
- Workflow changes run in `SECURITY DEFINER` database functions that re-check the caller's identity and role.
- Turn off public sign-ups (README §2.3).
- Require strong passwords in Supabase Auth settings and consider enabling MFA for administrators and quality managers.
- Deactivate leavers the same day; deactivation takes effect on their next request.

## Change control

Treat migrations like controlled documents: never edit an applied migration file — add a new numbered file,
take a backup first, test on a copy, and record who applied it and when.
