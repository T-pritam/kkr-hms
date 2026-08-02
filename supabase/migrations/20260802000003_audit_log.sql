-- Change log
--
-- Nothing in this system records who changed what. Several tables carry
-- created_by / updated_by columns, but they only ever hold the *last* writer,
-- the old value is discarded, and patient_case_sheets.updated_by was never
-- written at all — the PATCH handler ignored it.
--
-- This is an append-only log. One row per change, holding only the fields that
-- actually changed, with the actor's name and role snapshotted so the entry
-- still reads correctly after that user is deleted or renamed.
--
-- Deliberately not a trigger: writes go through the API, and a trigger cannot
-- see the authenticated user (RLS is off and the app connects as one role, so
-- auth.uid() is null here). The API knows who is acting; the trigger would not.

CREATE TABLE IF NOT EXISTS public.record_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was touched. entity_type is a free string rather than an enum so a new
  -- module can start logging without a migration.
  entity_type varchar(60) NOT NULL,      -- 'case_sheet' | 'patient' | 'lab_order' | ...
  entity_id   uuid NOT NULL,

  -- Denormalised so "everything that happened to this patient" is one query.
  patient_id  uuid REFERENCES public.patients(id) ON DELETE SET NULL,

  action      varchar(20) NOT NULL,      -- created | updated | deleted | finalised | reopened

  -- { "diagnosis": { "from": "...", "to": "..." } } — changed fields only.
  changes     jsonb,
  -- Human line for the timeline, e.g. 'Finalised the discharge summary'.
  summary     text,

  actor_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name  varchar(150),              -- snapshot
  actor_role  varchar(30),               -- snapshot

  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT record_audit_log_action_check
    CHECK (action IN ('created', 'updated', 'deleted', 'finalised', 'reopened'))
);

COMMENT ON TABLE public.record_audit_log IS
  'Append-only change log. Never UPDATE or DELETE rows here — an audit trail that can be edited is not an audit trail.';

CREATE INDEX IF NOT EXISTS idx_audit_entity  ON public.record_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON public.record_audit_log (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON public.record_audit_log (actor_id, created_at DESC);
