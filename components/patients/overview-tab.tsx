'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch';
import { CHARGE_CATEGORY_LABELS } from '@/lib/billing/constants';
import { PAYMENT_KIND_LABELS, type PaymentKind } from '@/lib/billing/payment-labels';

/**
 * Everything about one patient's stay on one screen (PRD v2, CR-16).
 *
 * The numbers follow the money model the client settled on 2026-09-22/23:
 * charges are internal, the total bill is what the patient paid, and the
 * hospital's expenses are the doctor fees and the referral commission. Money
 * collected separately for lab or medicine is passed on, so it is shown apart
 * from the hospital's income. Net is admin-only.
 */

interface Props {
  patientId: string;
  billingId?: string | null;
  onCreateBilling: () => void;
}

const inr = (value: unknown) =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const date = (value: string | null | undefined) =>
  value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function Card({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'muted';
}) {
  const tones = {
    default: 'bg-surface-inset',
    good: 'bg-success-subtle border border-success/20',
    warn: 'bg-warning-subtle border border-warning/30',
    muted: 'bg-surface-hover',
  };
  return (
    <div className={`rounded-lg p-4 ${tones[tone]}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="bg-surface-hover rounded-lg p-4 sm:p-6 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}



export default function OverviewTab({ patientId, billingId, onCreateBilling }: Props) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const url = `/api/patients/${patientId}/overview${billingId ? `?billing_id=${billingId}` : ''}`;
      const response = await fetch(url);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Failed to load the overview');
      setData(body);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patientId, billingId]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  useRealtimeRefetch(
    ['patient_billing', 'patient_billing_installments', 'patient_charges', 'doctor_visit_settlements'],
    fetchOverview,
  );

  if (loading) {
    return <div className="bg-surface-hover rounded-lg p-8 text-center text-muted">Loading…</div>;
  }

  if (error || !data) {
    return (
      <div className="bg-surface-hover rounded-lg p-8 text-center space-y-3">
        <p className="text-muted">{error || 'No overview available'}</p>
        <button
          onClick={onCreateBilling}
          className="bg-info hover:bg-info-hover text-foreground px-6 py-2 rounded-lg transition-colors"
        >
          Create Billing Record
        </button>
      </div>
    );
  }

  const { stay, money, services_used: services, doctor_fees: doctorFees, activity } = data;
  const breakdown = money.breakdown ?? { payments: money.total_bill, registration: 0, lab: 0, total: money.total_bill };
  const registration = stay.registration_fee;

  return (
    <div className="space-y-6">
      {/* The stay */}
      <Section
        title="This stay"
        aside={
          <button
            onClick={() => void fetchOverview()}
            className="text-muted hover:text-foreground"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted">Admitted</p>
            <p className="text-foreground">{date(stay.joined_date)}</p>
          </div>
          <div>
            <p className="text-muted">{stay.discharged_on ? 'Discharged' : 'Days so far'}</p>
            <p className="text-foreground">
              {stay.discharged_on ? date(stay.discharged_on) : stay.days ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-muted">Status</p>
            <p className="text-foreground">{stay.patient?.status || '—'}</p>
          </div>
          <div>
            <p className="text-muted">Referred by</p>
            <p className="text-foreground">{stay.referral?.name || '—'}</p>
          </div>
        </div>

        {registration?.status === 'pending' && registration.amount > 0 && (
          <p className="flex items-center gap-2 text-sm text-warning-text">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Registration fee {inr(registration.amount)} not collected yet — collect it on the Payments tab.
          </p>
        )}
      </Section>

      {/* Money */}
      <Section title="Money">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* x — the main amount (client, 26 Sep): what the patient paid for
              the stay. Registration and lab come in on their own. */}
          <Card
            label="Payments received"
            value={inr(breakdown.payments)}
            hint={`+ ${inr(breakdown.registration)} registration + ${inr(breakdown.lab)} lab = ${inr(breakdown.total)} in all`}
            tone="good"
          />
          <Card
            label="Expenses of this patient"
            value={inr(money.expenses.total)}
            hint={`${inr(money.expenses.doctor_fees.pending + money.expenses.referral_commission.pending)} still to pay`}
          />
          {money.net !== null && money.net !== undefined && (
            <Card label="Net for the hospital" value={inr(money.net)} hint="Income after expenses" />
          )}
        </div>

        {/* The client's own reading of the total: x + y + z = A, with x — the
            payments, the main amount — the largest. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-surface-inset px-4 py-3">
          <span>
            <span className="text-3xl font-bold text-success-text">{inr(breakdown.payments)}</span>{' '}
            <span className="text-sm text-muted">Payments</span>
          </span>
          <span className="text-muted">+</span>
          <span className="text-sm">
            <span className="font-semibold text-foreground">{inr(breakdown.registration)}</span>{' '}
            <span className="text-muted">Registration fee</span>
          </span>
          <span className="text-muted">+</span>
          <span className="text-sm">
            <span className="font-semibold text-foreground">{inr(breakdown.lab)}</span>{' '}
            <span className="text-muted">Lab tests</span>
          </span>
          <span className="text-muted">=</span>
          <span className="text-sm">
            <span className="font-semibold text-foreground">{inr(breakdown.total)}</span>{' '}
            <span className="text-muted">in all</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="bg-surface-inset rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">Payments by type</p>
            {Object.entries(money.by_label as Record<PaymentKind, number>)
              .filter(([, amount]) => Number(amount) > 0)
              .map(([kind, amount]) => (
                <div key={kind} className="flex justify-between text-sm">
                  <span className="text-muted">{PAYMENT_KIND_LABELS[kind as PaymentKind] ?? kind}</span>
                  <span className="text-foreground">{inr(amount)}</span>
                </div>
              ))}
            {money.total_bill === 0 && <p className="text-sm text-muted">No payments yet</p>}
          </div>

          <div className="bg-surface-inset rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">Expenses of this patient</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted">
                Doctor fees
                {money.expenses.doctor_fees.pending > 0 && (
                  <Badge variant="warning" className="ml-2">{inr(money.expenses.doctor_fees.pending)} pending</Badge>
                )}
              </span>
              <span className="text-foreground">{inr(money.expenses.doctor_fees.total)}</span>
            </div>
            {doctorFees?.map((fee: any) => (
              <div key={fee.id} className="flex justify-between text-xs pl-3">
                <span className="text-muted">{fee.doctor || 'Doctor'}</span>
                <span className="text-muted">
                  {inr(fee.total)} · {fee.settled ? 'paid' : 'pending'}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-1 border-t border-border">
              <span className="text-muted">
                Referral commission
                {money.expenses.referral_commission.pending > 0 && (
                  <Badge variant="warning" className="ml-2">pending</Badge>
                )}
              </span>
              <span className="text-foreground">{inr(money.expenses.referral_commission.amount)}</span>
            </div>
            {/* Medicine is always the hospital's expense (round 8). */}
            <div className="flex justify-between text-sm pt-1 border-t border-border">
              <span className="text-muted">Medicine</span>
              <span className="text-foreground">{inr(money.expenses.medicine ?? 0)}</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Services used */}
      <Section
        title="Services used"
        aside={<span className="text-sm text-muted">for reference — not billed against</span>}
      >
        <div className="divide-y divide-border">
          {services.by_category.map((row: any) => (
            <div key={row.category} className="flex justify-between py-2 text-sm">
              <span className="text-muted">
                {CHARGE_CATEGORY_LABELS[row.category as keyof typeof CHARGE_CATEGORY_LABELS] ?? row.category}
                <span className="text-xs"> · {row.count}</span>
              </span>
              <span className="text-foreground">{inr(row.total)}</span>
            </div>
          ))}
          {services.by_category.length === 0 && <p className="py-2 text-sm text-muted">No charges recorded</p>}
        </div>
        <div className="flex justify-between pt-2 border-t border-border text-sm font-semibold">
          <span className="text-foreground">Total</span>
          <span className="text-foreground">{inr(services.total)}</span>
        </div>
      </Section>

      {/* Activity */}
      <Section title="Activity">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          {[
            ['Doctor visits', activity.visits],
            ['Charges', activity.charges],
            ['Payments', activity.payments],
            ['Lab orders', activity.lab_orders],
            ['Pharmacy bills', activity.pharmacy_bills],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-muted">{label}</p>
              <p className="text-xl font-semibold text-foreground">{String(value)}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Last payment {activity.last_payment_date ? date(activity.last_payment_date) : '—'}
          {activity.case_sheet_status ? ` · case sheet ${activity.case_sheet_status}` : ''}
        </p>
      </Section>
    </div>
  );
}
