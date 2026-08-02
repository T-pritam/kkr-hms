# Patients & Doctors

Rebuilt Aug 2026. These are the two registries everything else in the app hangs
off, and they were the oldest code in it.

Before this, registering a patient meant typing a name and an ID into a form
whose only validation was that both were non-empty. The ID was hand-typed and
its uniqueness was a `SELECT` run a moment before the `INSERT`, with no
constraint behind it. Gender was pre-selected as "Male" and never enforced.
Nothing but `DELETE` checked a role.

---

## Registration

**Four required fields: name · patient ID · gender · phone.** Everything else is
optional and folded away, because a walk-in has to be registered in seconds.

```
Registration                              [always open]
  Patient ID *  [ 5/26 ]  ← next available, editable
  Name *        Gender *  Phone *
  Date of joining         Referred by

▸ Personal details      (Age · DOB · Blood group · Alt. phone · Email · Address)
▸ Emergency contact     (Name · Relation · Phone)
▸ Identification        (ID proof type · Number)
▸ Medical information   (History · Allergies · Current medications)
```

Each collapsed header shows how many of its fields are filled, so nothing is
hidden so much as put away.

**Gender has no default.** The old form's preselected "Male" meant an unanswered
question was stored as a fact and then printed on every document the patient
took home. Production still carried the evidence: six rows reading `MALE`,
which matched no dropdown option, so the edit modal silently rewrote them on the
next save. Normalised, then CHECK-constrained.

### The patient ID

Auto-issued in the hospital's existing format — `<serial>/<2-digit year>`,
restarting each January — and still editable, so a legacy or externally issued
number can be typed in.

The form shows a **peek** at the next number. Peeking does not consume it: an
abandoned registration would otherwise leave a permanent gap in a series people
read out over the phone. If the field is left untouched it is sent blank and the
real number is allocated server-side by `next_patient_id()`, inside a single
`INSERT … ON CONFLICT DO UPDATE … RETURNING` that takes a row lock.

So two receptionists both looking at `5/26` get `5/26` and `6/26`. A typed
duplicate is rejected by a **UNIQUE index** — which had never existed — and comes
back as a 409 against the field.

### Age

Two columns, deliberately: `date_of_birth` when it is known, and `age_years`
plus `age_recorded_on` when the patient simply states an age, which in practice
is most of the time.

A stated age is **never** back-computed into a birth date. Writing "45" as
`1981-01-01` invents a fact, and that invented date would then print on a
discharge summary as though someone had checked it. `resolveAge()` carries the
stated value forward from the date it was given, and the UI and the PDF print it
as `~45` so an approximation never reads as a verified one.

This also fixes a live bug: `patient.age` was read by the detail header, the
info tab and the discharge summary PDF, and no such column had ever existed. All
three printed nothing. So did `patient.email`.

### Status

| | |
|---|---|
| **Active** | Currently under care |
| **Discharged** | Set automatically when a discharge summary is finalised |
| **Cancelled** | Registration cancelled or created in error |

One vocabulary, CHECK-constrained. It previously meant four different things
depending on which screen wrote it — `Active/Inactive` in the edit modal,
lowercase `cancelled` on the info tab, `Discharged` from case-sheet finalise,
and `'discharge'` in the active-patients filter, a value nothing ever wrote, so
that endpoint served discharged patients as active.

`PUT` no longer defaults status to `Active`, so correcting a discharged
patient's phone number stops re-admitting them.

---

## Doctors

Added: **qualification**, **medical registration number**, **department** (a
fixed list, in `lib/doctors/constants.ts`) and **active / inactive**.
`specialist` stays free text alongside department — it is the finer-grained
label, and every existing row depends on it.

Qualification is the one that shows: discharge summaries and lab reports printed
a bare name over the signature rule.

### Deactivate, don't delete

Deleting a doctor was a hard delete with no dependency check, while
consultations, fee settlements, lab orders and signed discharge summaries all
reference the row. Every one of those foreign keys is `ON DELETE SET NULL`, so
the delete would not even fail — it would quietly blank the doctor's name off
records that had already been handed to patients.

Now: **Deactivate** removes them from every picker and leaves their history
untouched. A hard delete is admin-only and refused outright when anything still
points at them, with the counts spelled out so the dialog can offer deactivation
instead.

`/api/doctors/all` filters to active doctors — that is what makes deactivation
mean anything. `?includeId=` adds one back by id, so editing an old consultation
whose doctor has since retired does not silently lose the selection.

---

## Both lists

Rebuilt on the lab-orders house style: filter bar, `Badge` chips, `Modal`
dialogs, `UpdatedStamp` attribution, and an **inline error banner** — a failed
fetch used to log to the console and leave stale rows on screen as though
nothing had happened.

| | Patients | Doctors |
|---|---|---|
| Search | Name · patient ID · phone | Name · department · specialist · qualification · email · mobile |
| Filters | Status · date-of-join range | Department · active/inactive |
| Sorting | Patient ID · Name · Date of join | — |
| Columns | ID · Name · Age/Sex · Joined · Phone · Status | Name · Department · Specialist · Mobile · Status |

One form component per entity replaces the four near-identical create/edit
modals (~1,200 lines of copy-paste, down to two files). The doctor form is
shared with the inline "add a doctor" step inside the case sheet editor, so a
doctor added mid-summary is not a second-class record.

---

## Roles

| Capability | Roles |
|---|---|
| Read either registry | Admin, Doctor, Nurse, Receptionist, Lab Technician |
| Register / edit a patient · add / edit / deactivate a doctor | **Admin, Doctor, Nurse, Receptionist** |
| Delete a patient · hard-delete a doctor | **Admin** |

Reception can register patients and add referring doctors — it is their job, and
gating it behind a clinician would put a queue at the desk. The lab can read
both and write neither.

Defined once each, in `lib/patients/authz.ts` and `lib/doctors/authz.ts`,
mirroring `lib/case-sheet/authz.ts`. Every route goes through them, and the UI
hides what the caller cannot do using the same tables.

---

## The admission date

`patients.date_of_join` is captured at registration.
`patient_case_sheets.admission_date` is a separate column, and **nothing
connected the two** — so the admission date printed blank on every discharge
summary unless a clinician happened to retype it.

Now: a new case sheet inherits it, in the editor *and* server-side in the POST
route, so an API client gets the same default. It stays editable — a readmission
is a new admission, not the original registration. Existing sheets were
backfilled.

---

## Data model

```
patients ──1:N── patient_case_sheets      referrals ──1:N── patients
         ──1:N── patient_billing
         ──1:N── patient_consultations ──> doctors ──1:N── case_sheet_doctors
                                                   ──1:N── doctor_visit_settlements
                                                   ──1:N── lab_orders
patient_counters + next_patient_id() / peek_next_patient_id()
```

Migrations are `supabase/migrations/20260803*`. Both tables predate the
migrations directory and were extended in place.

---

## Fixed along the way

- **No role checks.** Only `DELETE /api/patients/[id]` read the role. Listing,
  creating, editing and PATCHing a patient — including changing their status —
  needed nothing but a token, and `PUT`/`DELETE` on a doctor had no guard at all
  (BUGS.md #9, #47, #48).
- **No UNIQUE constraint on `patients.patient_id`**, so a check-then-insert was
  the only thing standing between two simultaneous registrations and a duplicate
  ID.
- **`pageSize` was unbounded** — `?pageSize=100000` returned the whole table —
  and `page`/`pageSize` were un-NaN-guarded, so `?page=abc` reached
  `.range(NaN, NaN)` (BUGS.md #10).
- **Search terms went raw into a PostgREST `.or()` filter**, where a comma or a
  bracket rewrites the query. Now stripped through `safeSearch()`, extracted
  from the two places that had each grown their own fix.
- **`PUT` coerced `status || 'Active'`**, re-admitting any discharged patient it
  touched (BUGS.md #12).
- **`PUT` merged optional fields with `||`**, so once an address was written it
  could never be cleared — the same shape as BUGS.md #63 in the case sheet.
- **`/api/patients/active` filtered on `'discharge'`**, a value nothing ever
  wrote, so it never excluded anyone (BUGS.md #13).
- **`POST` returned only a message**, so the client could not learn what it had
  just created and had to re-query the list (BUGS.md #11).
- **The billing settlement tab's doctor picker was permanently empty** — it read
  `data.data` from `/api/doctors`, whose envelope is `{ doctors, total, … }`,
  and was paginated to 10 besides.
- **`/api/doctors/all` never selected `designation`**, which the case sheet
  multi-select read, so that value was always `undefined`.
- **`patient.age` and `patient.email` were rendered from columns that did not
  exist**, in three places and two respectively.
- **`patient-details-modal.tsx`** — 219 lines, imported nowhere. Deleted.

The test fake gained two things worth keeping: a `UNIQUE_INDEXES` registry, so
the duplicate-ID branch is testable at all, and a fix to the counter RPCs, which
were incrementing the clone `find()` returns and would therefore hand out the
same order number twice within one test.

---

## Known gaps

- **No admissions / IPD entity.** `date_of_join` is a single registration date,
  not an admission that can happen more than once. A readmitted patient's second
  case sheet prefills the *original* joining date and needs correcting by hand.
- **Patient and doctor edits are not written to `record_audit_log`** — that
  table is scoped to case sheets. `UpdatedStamp` covers "who last touched this",
  but not "what did they change". A small follow-up if it is wanted.
- **No duplicate-patient detection** on name + phone at registration, no ABHA or
  insurance/TPA fields, no patient photo.
- **No per-doctor consultation fee.** Settlement amounts stay hand-entered.
- **Deleting a patient still has no dependency check** — the remaining half of
  BUGS.md #9. It is admin-only now, but it still cascades through billing,
  charges, consultations, lab orders and discharge summaries without warning.
- **RLS is disabled on every table in this project.** Anyone holding the anon key
  can read or modify rows directly, bypassing every role table above. Not
  introduced by this work and not fixed by it, but it remains the largest
  security hole in the system.
