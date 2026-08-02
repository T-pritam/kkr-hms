# Case Sheet & Discharge Summary

Rebuilt Aug 2026 from a three-field form into a structured, attributable
clinical record with a printable discharge summary.

Before this, the whole feature was a discharge date, one free-text notes box and
a mandatory scanned PDF. There was no diagnosis, no consulting doctor, no
medication list, no generated document — the summary the hospital handed the
patient was a photocopy.

---

## The flow

```
New case sheet  →  fill in over the stay  →  Finalise  →  Download
     draft              draft                  final       (+ lab reports, scans)
                                                  │
                                            patient marked Discharged
```

**One case sheet per admission.** A readmitted patient gets a new one; older
summaries stay readable and printable. Each carries a document number,
`DS/2026/00012`.

**Only finalising discharges the patient.** A draft can be saved as many times
as you like without touching their status — which is the point, because the old
code discharged the patient the moment a case sheet was first saved.

---

## Screens

| Where | What it does |
|---|---|
| **Patient → Case Sheet & Discharge** | Every case sheet for that patient, newest first: number, dates, Draft/Final badge, diagnosis, consulting doctors, and who last changed it. Actions: View · Download · Edit · Reopen · History · Delete |
| **Editor** | Full-screen form, one section per group. **Save draft** or **Save & finalise** |
| **Download** | Pick which lab reports and which scans to append; everything comes down as one PDF |
| **History** | Who changed what, and when — old value → new value |

---

## What a case sheet holds

| Section | Fields |
|---|---|
| Admission & stay | Admission date, **discharge date**, ward/room, bed |
| **Consulting doctors** | Any number. Picked from the doctors list, or created inline without leaving the form |
| Presenting details | Chief complaints, history of present illness, past history |
| **Diagnosis** | Free text |
| Investigations | Free text — findings in the doctor's own words. Lab reports are appended to the PDF separately, not retyped |
| **Summary** | Course in hospital: what was done and how the patient responded |
| Condition on discharge | Stable / Improved / Recovered / Referred / Discharge on Request / LAMA / Absconded / Expired, plus BP, pulse, temperature, SpO2 |
| Discharge advice — medication | Repeatable rows: **medicine · dosage · qty · usage** |
| Discharge advice — notes | Free text |
| Follow-up | Follow-up date and instructions |
| Raw case sheet | Any number of scanned PDFs, each with its own view / download / delete |

The four in **bold** are required before a summary can be finalised. Everything
else is optional — a real discharge summary often has no past history worth
recording and no follow-up beyond "review if unwell".

### Medicines

Typing in the medicine box searches a **master list**. If the name isn't there,
`+ Add "<name>" to the medicine list` saves it so the next person gets it from
the dropdown. The list starts empty and fills up as it is used; nobody has to
maintain it. The typed name is kept on the case sheet either way, so a
prescription is never lost because the lookup failed.

The name is snapshotted onto the case sheet, so correcting a spelling in the
master never rewrites a summary that has already been printed.

---

## The change log

Every create, edit, finalise, reopen and delete writes a row to
`record_audit_log`, holding **only the fields that actually changed**, with the
old value and the new one, and the actor's name and role snapshotted so the
entry still reads correctly after that user is renamed or deleted.

Opening a form and pressing Save without touching anything writes nothing, so
the log stays readable.

The log is **append-only**: the table is granted `SELECT` and `INSERT` and
nothing else, and there is no route that can modify it. A trail that can be
rewritten is not a trail.

### "Last updated by" elsewhere

The same attribution now appears across the patient record — charges, payments,
billing, lab orders, doctor visits and patient info. Most of those tables had
been storing `created_by` / `updated_by` all along; nothing ever showed it.
`patients`, `doctors` and `lab_orders` had nowhere to store it and now do.

---

## The report

A4 portrait, built on the same toolkit as the lab report so the two documents a
patient goes home with match.

**Page 1 — the cover.** Logo, hospital name, address, phone, email; then
`DISCHARGE SUMMARY` with its number and date; then the patient block — name,
ID, age/sex, phone, address, admitted, discharged, ward/bed, consulting
doctors, condition on discharge. Nothing clinical on this page.

**Page 2 onwards — plain content.** Chief complaints → history → diagnosis →
investigations → summary → condition & vitals → medication → advice →
follow-up → `- - End of Summary - -`, the consulting doctors' names above
signature rules, and prepared-by / finalised-by attribution. Every section is
skipped entirely when empty rather than printing a blank heading.

Medication prints as a borderless four-column list whose headings repeat after
a page break. Every page is numbered.

**A draft prints a grey DRAFT watermark on every page**, so a half-written
summary can never be handed over as the real thing.

### Appending lab reports and scans

The Download dialog lists this patient's lab reports and the scans attached to
the case sheet. Tick any combination — individually or all at once — and they
are merged into a single PDF in a fixed order: summary → lab reports → scans.

This needs `pdf-lib`: jsPDF can write a PDF but cannot read one, so neither a
scan nor a separately generated lab report could otherwise be appended. A file
that cannot be parsed — a corrupt or password-protected scan — is skipped and
named in a warning; it never fails the whole download.

---

## Roles

| Capability | Roles |
|---|---|
| View, print and download | Admin, Doctor, Nurse, Receptionist, Lab Technician |
| Create and edit · attach scans | **Admin, Doctor, Nurse** |
| Finalise and reopen | **Admin, Doctor, Nurse** |
| Add to the medicine list | Admin, Doctor, Nurse |
| Delete a case sheet | Admin |

Defined in one place, `lib/case-sheet/authz.ts`. Every route goes through it, so
narrowing a list there is the only change needed to tighten it.

Reading stays open to everyone: reception hands the document over at the desk.

---

## Data model

```
patients ──1:N── patient_case_sheets ──1:N── case_sheet_doctors     ──> doctors
                          │             ──1:N── case_sheet_medications ──> medicines
                          │             ──1:N── case_sheet_attachments
                          │
                   record_audit_log  (entity_type = 'case_sheet')
```

`case_sheet_counters` + `next_discharge_summary_no()` issue document numbers
(`DS/<year>/<5 digits>`, restarting each year, concurrency-safe), mirroring the
lab module's accession numbers.

Migrations are in `supabase/migrations/20260802*`. `patient_case_sheets` was
extended in place; `discharge_notes` and `case_sheet_url` are **deprecated but
still present**, backfilled into `clinical_summary` and
`case_sheet_attachments`. Drop them once this is signed off in production.

---

## Fixed along the way

- **No authorisation at all.** All four case-sheet routes verified the token and
  then never read the role — a receptionist could write a discharge summary.
  Only DELETE was guarded.
- **The upload path did not verify its caller.** It went through a Supabase edge
  function that accepted *any* `Authorization` header without checking it, and
  minted a presigned R2 upload URL (BUGS.md 🔴). The edge function and its route
  are gone; bytes now go to R2 from a role-guarded route.
- **Attachments overwrote each other.** Uploading a replacement permanently
  deleted the previous scan. Several files are now kept.
- **The stored filename was not the stored key**, so the download route had to
  reverse-engineer the key by splitting the public URL (BUGS.md #62). The real
  key is now recorded at upload time.
- **Fields could not be cleared.** The PATCH handler merged with `||`, so once a
  discharge note was written it could never be emptied (BUGS.md #63).
- **Deleting a patient needed no role.** Any authenticated user could destroy a
  patient and everything hanging off them (half of BUGS.md #9). Admin only now.
- **The patient detail page header was blank.** It fetched
  `/api/patients?id=<id>`, which ignores the `id` and returns page one, so every
  field in the header read `undefined`.

---

## Known gaps

- **No admissions / IPD entity.** Admission date, ward and bed live on the case
  sheet, not on a real admission record. There is no bed occupancy, no transfer
  history and no daily notes. Correct for what is needed now; a true IPD module
  is its own project.
- **Billing is not wired up.** Finalising a summary triggers no final bill and
  reaches no invoice or ledger — the same deliberate gap as the lab module.
- **Branding is placeholder text** in `lib/pdf/branding.ts`. The cover page
  prints "Address line 1, Address line 2, City - PIN" until the real details and
  logo are supplied.
- **RLS is disabled on every table in this project**, these included. Anyone
  holding the anon key can read or modify rows directly, bypassing the API
  routes and the role table above. Not introduced by this work and not fixed by
  it, but it remains the largest security hole in the system.
- No ICD coding, no discharge-summary templates, no e-mail or WhatsApp delivery,
  no patient portal.
