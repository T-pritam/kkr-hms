-- Discharge time and who received the sheet — ward/bed are retired in code, not dropped
--
-- Ward and bed have been on the discharge form since the case-sheet rebuild, but this
-- hospital has no real admissions/bed-management entity behind them — they are a stand-in
-- docs/CASE_SHEET_MODULE.md already flags under "Known gaps". They are being retired.
--
-- This migration does not touch them. Dropping the columns would permanently discard
-- whatever has already been recorded for existing patients, for no operational benefit —
-- the fix is that the app stops asking for them, not that history is destroyed. See
-- lib/case-sheet/validate.ts: removing 'ward'/'bed' from CASE_SHEET_WRITABLE is what
-- actually retires them; the columns and their data simply become unreachable from here on.
--
-- In their place: `discharge_time`, paired with the existing date-only `discharge_date`
-- (which predates this migration history — created directly in the dashboard, per the
-- convention noted in 20260802000006_case_sheet_grants.sql). And `discharge_received_by`,
-- because nobody currently records who physically took the discharge sheet — often an
-- attendant, not a system user. Free text, following the same convention as
-- advances.given_by and doctor_visit_settlements.given_by: optional, not a session-derived
-- id, length-capped rather than constrained to a known user.

ALTER TABLE public.patient_case_sheets
  ADD COLUMN IF NOT EXISTS discharge_time         time,
  ADD COLUMN IF NOT EXISTS discharge_received_by   varchar(120);

COMMENT ON COLUMN public.patient_case_sheets.discharge_time IS 'Time of day the patient was discharged, paired with discharge_date. Optional.';
COMMENT ON COLUMN public.patient_case_sheets.discharge_received_by IS 'Who physically received the discharge sheet — often an attendant, not a system user. Free text, optional, same convention as advances.given_by.';
