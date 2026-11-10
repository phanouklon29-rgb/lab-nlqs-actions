-- =====================================================================
-- LAB NLQS — reference data for the Action Plan module
-- Migration 0003 · Inserts only (ON CONFLICT DO NOTHING) — safe to re-run.
--
-- REVIEW BEFORE GO-LIVE:
--  * ISO clause titles are short working titles for ISO 15189:2022 clauses 4–8.
--    Verify wording against your licensed copy of the standard.
--  * Category approval/effectiveness flags are DEFAULTS that encode policy.
--    Your quality manager should confirm them (Admin → Categories).
-- =====================================================================

-- 12 Quality System Essentials (CLSI QMS01 framework)
insert into public.qse_categories (code, name, sort_order) values
  ('QSE01','Organization and Leadership',1),
  ('QSE02','Customer Focus',2),
  ('QSE03','Facilities and Safety',3),
  ('QSE04','Personnel',4),
  ('QSE05','Supplier and Inventory',5),
  ('QSE06','Equipment',6),
  ('QSE07','Process Management',7),
  ('QSE08','Documents and Records',8),
  ('QSE09','Information Management',9),
  ('QSE10','Nonconforming Event Management',10),
  ('QSE11','Assessments',11),
  ('QSE12','Continual Improvement',12)
on conflict (code) do nothing;

insert into public.iso_clauses (clause, title, sort_order) values
  ('4.1','Impartiality',40100),
  ('4.2','Confidentiality',40200),
  ('4.3','Requirements regarding patients',40300),
  ('5.1','Legal entity',50100),
  ('5.2','Laboratory director',50200),
  ('5.3','Laboratory activities',50300),
  ('5.4','Structure and authority',50400),
  ('5.5','Objectives and policies',50500),
  ('5.6','Risk management',50600),
  ('6.1','Resources — general',60100),
  ('6.2','Personnel',60200),
  ('6.3','Facilities and environmental conditions',60300),
  ('6.4','Equipment',60400),
  ('6.5','Equipment calibration and metrological traceability',60500),
  ('6.6','Reagents and consumables',60600),
  ('6.7','Service agreements',60700),
  ('6.8','Externally provided products and services',60800),
  ('7.1','Processes — general',70100),
  ('7.2','Pre-examination processes',70200),
  ('7.3','Examination processes',70300),
  ('7.4','Post-examination processes',70400),
  ('7.5','Nonconforming work',70500),
  ('7.6','Control of data and information management',70600),
  ('7.7','Complaints',70700),
  ('7.8','Continuity and emergency preparedness planning',70800),
  ('8.1','Management system — general requirements',80100),
  ('8.2','Management system documentation',80200),
  ('8.3','Control of management system documents',80300),
  ('8.4','Control of records',80400),
  ('8.5','Actions to address risks and opportunities for improvement',80500),
  ('8.6','Improvement',80600),
  ('8.7','Nonconformities and corrective actions',80700),
  ('8.8','Evaluations',80800),
  ('8.9','Management reviews',80900)
on conflict (standard, clause) do nothing;

insert into public.action_categories
  (code, name, description, requires_approval, requires_effectiveness, requires_root_cause, sort_order) values
  ('CORRECTIVE','Corrective action','Eliminates the cause of a detected nonconformity (ISO 15189 8.7).', true,  true,  true,  1),
  ('RISK','Risk reduction','Addresses an identified risk (ISO 15189 5.6 / 8.5).',                      false, true,  false, 2),
  ('IMPROVEMENT','Quality improvement','Improvement opportunity (ISO 15189 8.6).',                       false, true,  false, 3),
  ('AUDIT','Audit follow-up','Follow-up of internal audit or external assessment findings (8.8).',     true,  true,  false, 4),
  ('MGMT_REVIEW','Management review action','Output of management review (8.9).',                      false, true,  false, 5),
  ('ROUTINE','Routine operational action','Operational task tracked for accountability; no effectiveness review.', false, false, false, 6)
on conflict (code) do nothing;

insert into public.action_sources (code, name, sort_order) values
  ('INT_AUDIT','Internal audit',1),
  ('EXT_ASSESS','External assessment / accreditation',2),
  ('EQA','EQA / proficiency testing',3),
  ('IQC','Internal quality control',4),
  ('NCE','Nonconforming event',5),
  ('COMPLAINT','Complaint / customer feedback',6),
  ('RISK','Risk assessment',7),
  ('MGMT_REVIEW','Management review',8),
  ('KPI','Quality indicator / KPI',9),
  ('SUGGESTION','Staff suggestion',10),
  ('OTHER','Other',99)
on conflict (code) do nothing;
