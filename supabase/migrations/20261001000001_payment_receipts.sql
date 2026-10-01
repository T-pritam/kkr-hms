-- Payment receipts — the desk's "Cash Receipt" for a patient's payments
-- (client, 1 Oct).
--
-- A receipt covers one payment or several, and everything on it but the amount
-- can be edited before it is printed: the receipt number (typed from the desk's
-- own book), the patient details, the consultant doctors, the department, and
-- each row's date, mode, type and remarks. The edits are kept, so a receipt
-- reopens exactly as it was last typed.
--
--   payment_receipts        one per receipt: what the header and footer say
--   payment_receipt_lines   one per payment on it: what that row says
--
-- The amount is never stored. It is read from the payment every time, so a
-- corrected payment corrects its receipt, and a deleted payment takes its row
-- with it (on delete cascade).
--
-- Additive: nothing live reads either table. Access control lives in the API;
-- the browser's key reaches neither (BUGS #68).
--
-- NOT applied to production until the client releases the receipts.

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  patient_billing_id uuid not null references public.patient_billing(id) on delete cascade,
  receipt_no text not null check (btrim(receipt_no) <> ''),
  heading text not null default 'Cash Receipt',
  patient_name text not null default '',
  age_sex text not null default '',
  mobile text not null default '',
  address text not null default '',
  ip_no text not null default '',
  doctors jsonb not null default '[]'::jsonb check (jsonb_typeof(doctors) = 'array'),
  department text not null default '',
  created_by_label text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_at timestamptz,
  updated_by uuid references public.users(id)
);

create index if not exists payment_receipts_patient_idx
  on public.payment_receipts (patient_id, created_at desc);

create table if not exists public.payment_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.payment_receipts(id) on delete cascade,
  installment_id uuid not null references public.patient_billing_installments(id) on delete cascade,
  position integer not null default 1,
  line_date date,
  payment_mode text not null default '',
  transaction_type text not null default '',
  remarks text not null default '',
  unique (receipt_id, installment_id)
);

create index if not exists payment_receipt_lines_installment_idx
  on public.payment_receipt_lines (installment_id);

comment on table public.payment_receipts is
  'A printed "Cash Receipt" for one or more of a patient''s payments. Every field is what the desk last typed; the amount is not here — it is read from the payment.';
comment on table public.payment_receipt_lines is
  'One payment on a receipt, with the row''s editable date, mode, type and remarks. The amount comes from patient_billing_installments.';

-- The server key only, stated outright rather than left to default privileges.
revoke all on public.payment_receipts, public.payment_receipt_lines from anon, authenticated;
grant all on public.payment_receipts, public.payment_receipt_lines to service_role;
