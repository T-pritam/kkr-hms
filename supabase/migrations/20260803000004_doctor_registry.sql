-- Doctor registry rebuild — qualification, department, and a way to retire a doctor
--
-- `doctors` held name, mobile, email, designation and specialist. Three things
-- were missing that the rest of the app already wants:
--
--   * qualification — the discharge summary and the lab report print a bare
--     name over the signature rule. "Dr. Rajesh Kumar" alone is not how a
--     clinical document is signed.
--   * registration_no — the medical council number, needed on anything the
--     hospital issues externally.
--   * is_active — DELETE was a hard delete with no dependency check, while
--     patient_consultations, doctor_visit_settlements, lab_orders and
--     case_sheet_doctors all reference doctors.id (BUGS.md #47/#48). Retiring a
--     doctor now hides them from every picker and leaves their history intact.
--
-- `department` is a preset list (lib/doctors/constants.ts) so the doctors list
-- and the fee-settlement screens can be grouped by it. `specialist` stays free
-- text: it is the finer-grained label and existing rows depend on it.

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS qualification   varchar(150),
  ADD COLUMN IF NOT EXISTS registration_no varchar(80),
  ADD COLUMN IF NOT EXISTS department      varchar(80),
  ADD COLUMN IF NOT EXISTS is_active       boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.doctors.qualification   IS 'e.g. MBBS, MD (General Medicine). Printed under the name on discharge summaries and lab reports.';
COMMENT ON COLUMN public.doctors.registration_no IS 'Medical council registration number.';
COMMENT ON COLUMN public.doctors.department      IS 'One of DEPARTMENTS in lib/doctors/constants.ts.';
COMMENT ON COLUMN public.doctors.is_active       IS 'Inactive doctors drop out of every picker but stay on the records that already reference them. Deactivation replaces deletion.';

-- Backfill department from the free-text specialist where the two plainly mean
-- the same thing, including the US spellings and the "-ologist" form the data
-- actually contains. Anything else is left NULL for a human rather than guessed.
UPDATE public.doctors
   SET department = m.department
  FROM (VALUES
    ('general medicine',        'General Medicine'),
    ('internal medicine',       'General Medicine'),
    ('physician',               'General Medicine'),
    ('general surgery',         'General Surgery'),
    ('surgery',                 'General Surgery'),
    ('surgeon',                 'General Surgery'),
    ('orthopaedics',            'Orthopaedics'),
    ('orthopedics',             'Orthopaedics'),
    ('orthopaedic',             'Orthopaedics'),
    ('orthopedic',              'Orthopaedics'),
    ('obstetrics & gynaecology','Obstetrics & Gynaecology'),
    ('obstetrics and gynaecology','Obstetrics & Gynaecology'),
    ('gynaecology',             'Obstetrics & Gynaecology'),
    ('gynecology',              'Obstetrics & Gynaecology'),
    ('paediatrics',             'Paediatrics'),
    ('pediatrics',              'Paediatrics'),
    ('paediatrician',           'Paediatrics'),
    ('pediatrician',            'Paediatrics'),
    ('cardiology',              'Cardiology'),
    ('cardiologist',            'Cardiology'),
    ('dermatology',             'Dermatology'),
    ('dermatologist',           'Dermatology'),
    ('ent',                     'ENT'),
    ('otorhinolaryngology',     'ENT'),
    ('ophthalmology',           'Ophthalmology'),
    ('ophthalmologist',         'Ophthalmology'),
    ('neurology',               'Neurology'),
    ('neurologist',             'Neurology'),
    ('nephrology',              'Nephrology'),
    ('nephrologist',            'Nephrology'),
    ('gastroenterology',        'Gastroenterology'),
    ('gastroenterologist',      'Gastroenterology'),
    ('pulmonology',             'Pulmonology'),
    ('pulmonologist',           'Pulmonology'),
    ('urology',                 'Urology'),
    ('urologist',               'Urology'),
    ('psychiatry',              'Psychiatry'),
    ('psychiatrist',            'Psychiatry'),
    ('dentistry',               'Dentistry'),
    ('dental',                  'Dentistry'),
    ('dentist',                 'Dentistry'),
    ('anaesthesiology',         'Anaesthesiology'),
    ('anesthesiology',          'Anaesthesiology'),
    ('anaesthetist',            'Anaesthesiology'),
    ('radiology',               'Radiology'),
    ('radiologist',             'Radiology'),
    ('pathology',               'Pathology & Laboratory'),
    ('pathologist',             'Pathology & Laboratory'),
    ('physiotherapy',           'Physiotherapy'),
    ('physiotherapist',         'Physiotherapy'),
    ('emergency',               'Emergency & Casualty'),
    ('casualty',                'Emergency & Casualty'),
    ('oncology',                'Oncology'),
    ('oncologist',              'Oncology'),
    ('endocrinology',           'Endocrinology'),
    ('endocrinologist',         'Endocrinology')
  ) AS m(alias, department)
 WHERE public.doctors.department IS NULL
   AND lower(trim(public.doctors.specialist)) = m.alias;

CREATE INDEX IF NOT EXISTS doctors_is_active_idx ON public.doctors (is_active);
