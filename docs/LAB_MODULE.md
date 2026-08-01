# Lab / Pathology Module

Rebuilt Aug 2026 from a flat CRUD screen into a real LIS flow, modelled on how
CrelioHealth / Drlogy / SCC Soft Computer work and on what NABL 112 / ISO 15189
§7.4 expect of a lab report.

---

## The flow

```
Register order  →  Collect sample  →  Receive in lab  →  Enter results  →  Interpretation  →  Report
  registered         collected           received          in_progress                        reported
```

**An order is one requisition at one visit.** It carries every test taken from
that sample under a single accession number (`LAB/2026/00184`). The same test
repeated on another date is a *new* order — which is what makes a patient's lab
history a timeline rather than a pile of unrelated rows.

Each stage stamps a real timestamp: **Registered / Collected / Received /
Reported**. All four print on the report.

---

## Screens

| Screen | Path | What it does |
|---|---|---|
| **Lab Orders** | `/lab/orders` | Worklist. Search, filter by status, and drive each order through the flow. Actions change with status: Collect Sample → Receive in Lab → Enter Results → Report. |
| **Test Catalogue** | `/lab/tests` | Tests, their parameters and reference intervals — one screen. |
| **Patient → Lab tab** | `/patients/[id]` | That patient's lab history, newest first, with a Report button per order. |

---

## Registering an order

Two modes:

- **Registered patient** — search by name, patient ID or phone. Active patients
  sort first and each row shows the ID and status. Selecting one links the order
  to the patient record and freezes their name / age / sex / ID onto the order,
  read from the patient record server-side.
- **Walk-in / OPD** — type the details in. No patient record needed;
  the demographics live on the order.

Also on the order: referring doctor (from the doctors list, or free text for an
outside doctor), priority (routine / urgent), multiple tests with per-test price
override, discount, and notes.

> Age and sex are not cosmetic — they decide which reference interval each result
> is judged against. Leaving them blank means age- and sex-specific intervals
> can't be applied.

---

## Test catalogue

A test carries a name, code, department, specimen, method, price and an optional
default interpretation. Under it sit **parameters** — the lines that appear on
the report.

**Parameter types**

| Type | Use for | Result entry shows |
|---|---|---|
| Numeric | Measured values | Number box |
| Qualitative | Positive/Negative, Reactive/Non-Reactive, Nil/Trace/1+ | Picklist |
| Calculated | A/G Ratio, LDL (Friedewald), MCH, MCHC | Read-only, computed live |

Calculated parameters reference others by code in braces —
`{ALB} / ({TP} - {ALB})` — using only `+ - * / ( )`. Formulas are parsed, never
`eval`'d, and produce nothing rather than a misleading number when an input is
blank or a division hits zero.

Parameters also carry an optional **sub-heading** (e.g. `DIFFERENTIAL COUNT`),
a **method**, and decimal precision.

**Reference intervals** are separate rows, so one parameter can have several:

- banded by **sex** and by **age** (`0–1 yr`, `1–12 yr`, `12+`)
- `between min and max`, `< 200`, `> 40`, or a text value like `Negative`
- optional **critical low / critical high** bounds

The most specific match wins: sex beats sex-agnostic, and an age band that
actually contains the patient beats an unbounded one. When the patient's age is
unknown, age-banded intervals are skipped rather than guessed.

---

## Entering results

One accordion per test in the order. Each parameter gets the input its type
calls for, calculated values update as you type, and out-of-range results are
flagged **H** / **L** live — the same code the server uses when it stores them.

Everything clinical is derived server-side and never taken from the browser: the
interval that applied to this patient, whether the result is out of range, and
whether it is critical. The values stored alongside each result (`unit`,
`ref_display`, `ref_min`, `ref_max`) are a **snapshot**, so reprinting an old
report reproduces it exactly even if the catalogue has changed since.

Re-submitting corrects rather than duplicates; a parameter left blank has its
stored value removed.

**Interpretation** — the clinical summary, per test, printed under the results.
Reusable templates can be saved per test or globally. The author and time are
stamped on every save.

**Authorisation is optional.** The report prints as soon as results are entered.
If someone does authorise, their name appears in the footer; editing results
afterwards drops the authorisation, so a sign-off can never outlive the numbers
it was given for.

---

## The report

A4 portrait, borderless clinical layout — the standard Indian pathology report.

```
              KKR HOSPITAL & MEDICAL SERVICES
              <address>  •  Ph: <phone>
─────────────────────────────────────────────────────────────────────
 Name    : Ramesh Kumar          Order No  : LAB/2026/00184
 Age/Sex : 42 Y / Male           Registered: 01/08/26 09:12 AM
 Pat. ID : 118/25                Collected : 01/08/26 09:40 AM
 Ref. By : Dr. S. Rao            Received  : 01/08/26 10:05 AM
                                 Reported  : 01/08/26 02:30 PM

  COMPLETE BLOOD COUNT
  Specimen: Whole Blood (EDTA)      Method: Automated Cell Counter

  Investigation             Result       Unit        Biological Ref. Interval
  ───────────────────────────────────────────────────────────────────────────
  Haemoglobin               13.2         g/dL        13 - 17
  Total Leucocyte Count     12400   H    /cu.mm      4000 - 10000
  Platelet Count            1.8     L    lakh/cu.mm  1.5 - 4.1

   DIFFERENTIAL COUNT
  Neutrophils               62           %           40 - 80
  ───────────────────────────────────────────────────────────────────────────
  H = above reference interval     L = below reference interval

  INTERPRETATION
  Mild leucocytosis with thrombocytopenia. Suggest clinical correlation.

                                             - -  End of Report  - -

  Entered by: A. Patil                    ____________________
  Authorised by: Dr. S. Rao                Authorised Signatory
```

No cell borders, **no "Flag" column**, **no "Verified"** anywhere — abnormal
results are bold with an `H` or `L` beside them, which is the convention every
real lab report uses. Critical values additionally print in red. Column headings
repeat after a page break and every page is numbered.

Available as **Download PDF** and **Print** (scoped so only the report prints).

---

## Roles

Interim policy — deliberately permissive while the lab is run by whoever is on
shift. Defined in one place, `lib/lab/authz.ts`; narrowing a list there is the
only change needed to tighten it.

| Capability | Roles |
|---|---|
| View catalogue and orders | Admin, Doctor, Nurse, Receptionist, Lab Technician |
| Register orders, collection, receipt | Admin, Receptionist, Lab Technician, Nurse |
| Enter results | Admin, Lab Technician, Nurse |
| Write the interpretation | Admin, Doctor, Lab Technician, Nurse |
| Edit the catalogue and reference intervals | Admin, Lab Technician |
| Authorise a report | Admin, Doctor |

---

## Data model

```
lab_orders  ──1:N──  lab_order_items  ──1:N──  lab_result_values
    │                      │                          │
 patients              lab_tests  ──1:N──  test_parameters  ──1:N──  test_parameter_ranges
 doctors
```

`lab_order_counters` + `next_lab_order_no()` issue accession numbers
(`LAB/<year>/<5 digits>`, restarting each year, concurrency-safe).

Migrations live in `supabase/migrations/` — the first time this project's schema
has been in version control. The legacy `patient_test_results` /
`test_result_values` tables are **left in place**; rename them to `*_legacy`
once this has been signed off in production.

---

## Known gaps

- **Billing is not wired up.** Lab orders carry price / discount / net amount,
  but that money reaches no invoice, no daily ledger and no finance report.
  Deferred deliberately.
- **14 Urine Analysis parameters have no reference interval** — Color, Protein,
  Glucose, Ketones, Pus Cells and so on. They are qualitative, and the old
  numeric-only model had nowhere to record them, so they came across blank.
  Set each to *Qualitative* with its options in the test editor.
- **Branding is placeholder text** in `lib/pdf/branding.ts` — address, phone,
  email and logo still need the real values before any report goes to a patient.
- **RLS is disabled on every table in this project**, lab included. Anyone
  holding the anon key can read or modify rows directly, bypassing these API
  routes and the role table above. Not introduced by this work, and not fixed by
  it — but it is the largest security hole in the system and deserves its own
  task.
- No barcode / label printing, no analyser interfacing (HL7 / ASTM), no
  panels or profiles, no WhatsApp / email delivery, no patient portal.
