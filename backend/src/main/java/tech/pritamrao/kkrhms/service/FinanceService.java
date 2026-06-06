package tech.pritamrao.kkrhms.service;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

@Service
public class FinanceService {

    private final PatientBillingInstallmentRepository installmentRepository;
    private final PatientChargeRepository chargeRepository;
    private final PatientBillingRepository billingRepository;
    private final ExpenseRepository expenseRepository;
    private final SalaryPaymentRepository salaryRepository;
    private final LedgerTransactionRepository ledgerRepository;
    private final DoctorVisitSettlementRepository settlementRepository;
    private final PatientRepository patientRepository;
    private final DoctorRepository doctorRepository;
    private final ReferralRepository referralRepository;

    public FinanceService(PatientBillingInstallmentRepository installmentRepository, PatientChargeRepository chargeRepository,
                          PatientBillingRepository billingRepository, ExpenseRepository expenseRepository,
                          SalaryPaymentRepository salaryRepository, LedgerTransactionRepository ledgerRepository,
                          DoctorVisitSettlementRepository settlementRepository, PatientRepository patientRepository,
                          DoctorRepository doctorRepository,
                          ReferralRepository referralRepository) {
        this.referralRepository = referralRepository;
        this.installmentRepository = installmentRepository;
        this.chargeRepository = chargeRepository;
        this.billingRepository = billingRepository;
        this.expenseRepository = expenseRepository;
        this.salaryRepository = salaryRepository;
        this.ledgerRepository = ledgerRepository;
        this.settlementRepository = settlementRepository;
        this.patientRepository = patientRepository;
        this.doctorRepository = doctorRepository;
    }

    public Map<String, Object> summary(String monthYear) {
        String month = monthYear != null ? monthYear : YearMonth.now().toString();
        YearMonth ym = YearMonth.parse(month);
        LocalDate startDate = ym.atDay(1);
        LocalDate endDate = ym.atEndOfMonth();

        BigDecimal totalPaid = installmentRepository.findByPaymentDateBetween(startDate, endDate).stream()
                .map(PatientBillingInstallment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalCharges = chargeRepository.findByChargeDateBetween(startDate, endDate).stream()
                .map(c -> nz(c.getAmount()).multiply(BigDecimal.valueOf(c.getQty() != null ? c.getQty() : 1)))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<PatientBilling> billings = billingRepository.findByMonthYear(month);
        BigDecimal totalCommission = billings.stream().map(b -> nz(b.getReferralCommissionAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalDoctorFees = billings.stream().map(b -> nz(b.getTotalDoctorFees())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalBillingCharges = billings.stream().map(b -> nz(b.getTotalCharges())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalBillingPaid = billings.stream().map(b -> nz(b.getPatientPaidAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal pendingReceivables = totalBillingCharges.subtract(totalBillingPaid);

        BigDecimal totalExpense = expenseRepository.findByMonthYear(month).stream()
                .map(Expense::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalSalary = salaryRepository.findByMonthYear(month).stream()
                .map(s -> "settled".equals(s.getStatus()) ? nz(s.getCalculatedSalary()) : nz(s.getTotalAdvance()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal ledgerExpenseTotal = ledgerRepository
                .findByTransactionDateBetweenAndTransactionTypeAndSource(startDate, endDate, "debit", "expense").stream()
                .map(LedgerTransaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalExpenses = totalExpense.add(totalSalary).add(ledgerExpenseTotal).add(totalCommission).add(totalDoctorFees);
        BigDecimal netIncome = totalPaid;
        BigDecimal netProfit = netIncome.subtract(totalExpenses);

        List<DoctorVisitSettlement> unsettledDoctor = settlementRepository.findBySettledFalseAndDeletedAtIsNull();
        BigDecimal totalUnsettledDoctorFees = unsettledDoctor.stream().map(d -> nz(d.getTotalAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<PatientBilling> unsettledReferrals = billingRepository
                .findByReferralSettledFalseAndReferralCommissionAmountGreaterThan(BigDecimal.ZERO);
        BigDecimal totalUnsettledCommissions = unsettledReferrals.stream()
                .map(b -> nz(b.getReferralCommissionAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Map<String, Object>> recent = ledgerRepository.findByTransactionDateBetween(startDate, endDate).stream()
                .sorted(Comparator.comparing(LedgerTransaction::getTransactionDate).reversed())
                .map(this::ledgerView).toList();

        Map<String, Object> income = new LinkedHashMap<>();
        income.put("total_charges", totalCharges);
        income.put("total_paid", totalPaid);
        income.put("total_commission", totalCommission);
        income.put("pending_receivables", pendingReceivables);
        income.put("net_income", netIncome);
        income.put("billing_count", billings.size());

        Map<String, Object> expenses = new LinkedHashMap<>();
        expenses.put("general_expenses", totalExpense);
        expenses.put("salary_expenses", totalSalary);
        expenses.put("ledger_expenses", ledgerExpenseTotal);
        expenses.put("referral_commissions", totalCommission);
        expenses.put("doctor_fees", totalDoctorFees);
        expenses.put("total_expenses", totalExpenses);

        Map<String, Object> profit = new LinkedHashMap<>();
        profit.put("net_profit", netProfit);
        profit.put("is_profit", netProfit.signum() >= 0);
        profit.put("profit_margin", netIncome.signum() > 0
                ? netProfit.multiply(BigDecimal.valueOf(100)).divide(netIncome, 2, java.math.RoundingMode.HALF_UP) : BigDecimal.ZERO);

        Map<String, Object> pending = new LinkedHashMap<>();
        pending.put("doctor_fees", totalUnsettledDoctorFees);
        pending.put("doctor_count", unsettledDoctor.size());
        pending.put("referral_commissions", totalUnsettledCommissions);
        pending.put("referral_count", unsettledReferrals.size());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("month_year", month);
        data.put("income", income);
        data.put("expenses", expenses);
        data.put("profit", profit);
        data.put("pending_settlements", pending);
        data.put("recent_transactions", recent);
        return Map.of("success", true, "data", data);
    }

    // ── expenses ──────────────────────────────────────────────────────────
    public Map<String, Object> listExpenses(String monthYear) {
        String month = monthYear != null ? monthYear : YearMonth.now().toString();
        return Map.of("success", true, "data", expenseRepository.findByMonthYearOrderByExpenseDateDesc(month));
    }

    @Transactional
    public Map<String, Object> createExpense(String type, BigDecimal amount, LocalDate date, String remarks) {
        if (type == null || amount == null || date == null) {
            throw ApiException.badRequest("Missing required fields: expense_type, amount, expense_date");
        }
        if (amount.signum() <= 0) throw ApiException.badRequest("Amount must be greater than 0");
        Expense e = new Expense();
        e.setExpenseType(type);
        e.setAmount(amount);
        e.setExpenseDate(date);
        e.setMonthYear(date.toString().substring(0, 7));
        e.setRemarks(remarks);
        return Map.of("success", true, "data", expenseRepository.save(e));
    }

    @Transactional
    public Map<String, Object> updateExpense(Long id, String type, BigDecimal amount, LocalDate date, String remarks) {
        if (id == null) throw ApiException.badRequest("Missing expense id");
        if (type == null || amount == null || date == null) {
            throw ApiException.badRequest("Missing required fields: expense_type, amount, expense_date");
        }
        if (amount.signum() <= 0) throw ApiException.badRequest("Amount must be greater than 0");
        Expense e = expenseRepository.findById(id).orElseThrow(() -> ApiException.notFound("Expense not found"));
        e.setExpenseType(type);
        e.setAmount(amount);
        e.setExpenseDate(date);
        e.setMonthYear(date.toString().substring(0, 7));
        e.setRemarks(remarks);
        return Map.of("success", true, "data", expenseRepository.save(e));
    }

    @Transactional
    public Map<String, Object> deleteExpense(Long id) {
        if (id == null) throw ApiException.badRequest("Missing expense id");
        expenseRepository.deleteById(id);
        return Map.of("success", true, "message", "Expense deleted successfully");
    }

    // ── referral commissions ──────────────────────────────────────────────
    public Map<String, Object> referralCommissions(Boolean settled, String referredBy) {
        List<PatientBilling> billings = billingRepository
                .findByReferralCommissionAmountGreaterThanOrderByCreatedAtDesc(BigDecimal.ZERO);
        List<Map<String, Object>> data = new ArrayList<>();
        for (PatientBilling b : billings) {
            if (settled != null && !settled.equals(b.getReferralSettled())) continue;
            Patient patient = patientRepository.findById(b.getPatientId()).orElse(null);
            if (referredBy != null && (patient == null || !referredBy.equals(patient.getReferredBy()))) continue;
            Map<String, Object> m = billingView(b);
            m.put("patient", PatientBrief.of(patient));
            m.put("referral", resolveReferral(patient));
            data.add(m);
        }
        return Map.of("success", true, "data", data);
    }

    @Transactional
    public Map<String, Object> settleReferralCommissions(List<UUID> billingIds, String paymentMethod,
                                                         String transactionReference, String settlementNotes, UUID userId) {
        if (billingIds == null || billingIds.isEmpty()) throw ApiException.badRequest("billing_ids array is required");
        if (paymentMethod == null) throw ApiException.badRequest("payment_method is required");
        List<Map<String, Object>> updated = new ArrayList<>();
        for (UUID id : billingIds) {
            PatientBilling b = billingRepository.findById(id).orElse(null);
            if (b == null || Boolean.TRUE.equals(b.getReferralSettled())) continue;
            b.setReferralSettled(true);
            b.setReferralSettlementDate(Instant.now());
            b.setReferralSettlementNotes(settlementNotes);
            b.setUpdatedBy(userId);
            billingRepository.save(b);

            Patient patient = patientRepository.findById(b.getPatientId()).orElse(null);
            LedgerTransaction txn = new LedgerTransaction();
            txn.setTransactionDate(LocalDate.now());
            txn.setTransactionType("debit");
            txn.setSource("referral_commission");
            txn.setAmount(nz(b.getReferralCommissionAmount()));
            txn.setPaymentMode(paymentMethod);
            txn.setReferenceNumber(transactionReference);
            txn.setPatientId(b.getPatientId());
            txn.setDescription("Referral commission - " + (patient != null ? patient.getName() : "Unknown Patient"));
            txn.setNotes(settlementNotes);
            txn.setStatus("verified");
            txn.setCreatedBy(userId);
            ledgerRepository.save(txn);

            updated.add(billingView(b));
        }
        return Map.of("success", true, "message", updated.size() + " commission(s) settled successfully", "data", updated);
    }

    // ── doctor settlements (finance view) ─────────────────────────────────
    public Map<String, Object> doctorSettlements(Boolean settled, UUID doctorId, UUID patientId) {
        List<SettlementView> data = settlementRepository.findByDeletedAtIsNullOrderByCreatedAtDesc().stream()
                .filter(s -> settled == null || settled.equals(s.getSettled()))
                .filter(s -> doctorId == null || doctorId.equals(s.getDoctorId()))
                .filter(s -> patientId == null || patientId.equals(s.getPatientId()))
                .map(this::settlementView).toList();
        return Map.of("success", true, "data", data);
    }

    @Transactional
    public Map<String, Object> settleDoctorSettlements(List<UUID> settlementIds, BigDecimal settlementAmount,
                                                       String paymentMethod, String transactionReference,
                                                       String settlementNotes, UUID userId) {
        if (settlementIds == null || settlementIds.isEmpty()) throw ApiException.badRequest("settlement_ids array is required");
        if (paymentMethod == null) throw ApiException.badRequest("payment_method is required");
        List<SettlementView> updated = new ArrayList<>();
        for (UUID id : settlementIds) {
            DoctorVisitSettlement s = settlementRepository.findById(id).orElse(null);
            if (s == null || Boolean.TRUE.equals(s.getSettled())) continue;
            s.setSettled(true);
            s.setSettlementDate(Instant.now());
            s.setSettlementAmount(settlementAmount);
            s.setPaymentMethod(paymentMethod);
            s.setTransactionReference(transactionReference);
            s.setSettlementNotes(settlementNotes);
            s.setUpdatedBy(userId);
            settlementRepository.save(s);

            Doctor doctor = s.getDoctorId() == null ? null : doctorRepository.findById(s.getDoctorId()).orElse(null);
            LedgerTransaction txn = new LedgerTransaction();
            txn.setTransactionDate(LocalDate.now());
            txn.setTransactionType("debit");
            txn.setSource("doctor_settlement");
            txn.setAmount(settlementAmount != null ? settlementAmount : nz(s.getTotalAmount()));
            txn.setPaymentMode(paymentMethod);
            txn.setReferenceNumber(transactionReference);
            txn.setDescription("Doctor settlement - " + (doctor != null ? doctor.getName() : "Unknown Doctor"));
            txn.setNotes(settlementNotes);
            txn.setStatus("verified");
            txn.setCreatedBy(userId);
            ledgerRepository.save(txn);

            updated.add(settlementView(s));
        }
        return Map.of("success", true, "message", updated.size() + " settlement(s) processed successfully", "data", updated);
    }

    private SettlementView settlementView(DoctorVisitSettlement s) {
        Doctor doctor = s.getDoctorId() == null ? null : doctorRepository.findById(s.getDoctorId()).orElse(null);
        Patient patient = s.getPatientId() == null ? null : patientRepository.findById(s.getPatientId()).orElse(null);
        return SettlementView.of(s, doctor, patient);
    }

    private Map<String, Object> billingView(PatientBilling b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.getId());
        m.put("patient_id", b.getPatientId());
        m.put("referral_commission_amount", b.getReferralCommissionAmount());
        m.put("referral_settled", b.getReferralSettled());
        m.put("referral_settlement_date", b.getReferralSettlementDate());
        m.put("referral_settlement_notes", b.getReferralSettlementNotes());
        m.put("total_charges", b.getTotalCharges());
        m.put("patient_paid_amount", b.getPatientPaidAmount());
        m.put("month_year", b.getMonthYear());
        return m;
    }

    private Map<String, Object> ledgerView(LedgerTransaction t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("transaction_date", t.getTransactionDate());
        m.put("transaction_type", t.getTransactionType());
        m.put("source", t.getSource());
        m.put("amount", t.getAmount());
        m.put("payment_mode", t.getPaymentMode());
        m.put("description", t.getDescription());
        m.put("status", t.getStatus());
        m.put("reference_number", t.getReferenceNumber());
        m.put("patient_id", t.getPatientId());
        m.put("created_at", t.getCreatedAt());
        Patient p = t.getPatientId() == null ? null : patientRepository.findById(t.getPatientId()).orElse(null);
        m.put("patient", PatientBrief.of(p));
        return m;
    }

    private Map<String, Object> resolveReferral(Patient patient) {
        if (patient == null || patient.getReferredBy() == null || patient.getReferredBy().isBlank()) return null;
        try {
            return referralRepository.findById(UUID.fromString(patient.getReferredBy()))
                    .map(r -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", r.getId());
                        m.put("name", r.getName());
                        m.put("phone", r.getPhone());
                        m.put("status", r.getStatus());
                        return m;
                    }).orElse(null);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
