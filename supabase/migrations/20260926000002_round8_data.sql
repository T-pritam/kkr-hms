-- Round 8 (data half) — applied after the code that expects it is live.
--
-- Client's answers, 26 Sep:
--   * 60/26's ₹800 lab test was really paid ("Lab — Lab Test (collected
--     separately)", relabelled Regular in round 5): it becomes a Lab payment,
--     booked to the ledger's Lab type, with its charge line linked to it —
--     exactly what "Add lab test" now writes.
--   * test23's ₹400 lab charge has no payment behind it: deleted.
--   * 6/26's ₹100 registration line was written at registration although the
--     fee was never collected (BUGS #77): deleted. The fee stays pending and
--     now reads the catalogue's current price.
--   * The five hand-added ₹300 registration lines (60/26, 280/26–283/26) are
--     left as they are.
-- Each deletion leaves an audit row, and the affected bills are re-totalled.

do $$
declare
  lab_payment record;
  deleted record;
begin
  -- 1. 60/26: the ₹800 lab payment and its charge line.
  select i.id, i.ledger_transaction_id, c.id as charge_id
    into lab_payment
    from public.patient_billing_installments i
    join public.patient_billing b on b.id = i.patient_billing_id
    join public.patients p on p.id = b.patient_id
    join public.patient_charges c on c.patient_billing_id = b.id
    join public.charge_items ci on ci.id = c.charge_item_id and ci.category = 'lab'
   where p.patient_id = '60/26'
     and i.amount = 800 and c.amount = 800
     and i.remarks like 'Lab — %'
     and c.installment_id is null;

  if lab_payment.id is not null then
    update public.patient_billing_installments set kind = 'lab' where id = lab_payment.id;
    update public.daily_ledger_transactions set source = 'lab' where id = lab_payment.ledger_transaction_id;
    update public.patient_charges set installment_id = lab_payment.id where id = lab_payment.charge_id;
  end if;

  -- 2 and 3. Lines with nothing behind them.
  for deleted in
    delete from public.patient_charges c
     using public.charge_items ci, public.patients p, public.patient_billing b
     where ci.id = c.charge_item_id and p.id = c.patient_id and b.id = c.patient_billing_id
       and c.installment_id is null
       and (
         (ci.category = 'lab' and p.patient_id = 'test23' and c.amount = 400)
         or (ci.is_registration_fee and b.registration_fee_status = 'pending'
             and not exists (select 1 from public.patient_billing_installments i
                              where i.patient_billing_id = b.id and i.kind = 'registration'))
       )
    returning c.id, c.patient_id, c.patient_billing_id, c.charge_type, c.amount, c.qty, c.charge_date
  loop
    insert into public.record_audit_log (entity_type, entity_id, patient_id, action, changes, summary, actor_name, actor_role)
    values (
      'patient_charge', deleted.id, deleted.patient_id, 'deleted',
      jsonb_build_object('charge_type', deleted.charge_type, 'amount', deleted.amount, 'qty', deleted.qty, 'charge_date', deleted.charge_date),
      format('Round 8 clean-up: removed %s ₹%s — no payment behind it (client, 26 Sep)', deleted.charge_type, deleted.amount),
      'System (round 8 migration)', 'ADMIN'
    );

    update public.patient_billing b
       set patient_charges_total = coalesce((select sum(amount * coalesce(qty, 1)) from public.patient_charges where patient_billing_id = b.id), 0),
           total_charges        = coalesce((select sum(amount * coalesce(qty, 1)) from public.patient_charges where patient_billing_id = b.id), 0)
     where b.id = deleted.patient_billing_id;
  end loop;
end;
$$;
