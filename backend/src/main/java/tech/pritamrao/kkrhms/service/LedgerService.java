package tech.pritamrao.kkrhms.service;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tech.pritamrao.kkrhms.security.AuthUser;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

@Service
public class LedgerService {

    private static final List<String> PAYMENT_MODES = List.of("cash", "upi", "card", "bank_transfer", "cheque");
    private static final List<String> SOURCES = List.of("patient", "opd", "expense");

    private final LedgerTransactionRepository transactionRepository;
    private final DailyLedgerClosureRepository closureRepository;
    private final PatientRepository patientRepository;
    private final UserRepository userRepository;

    public LedgerService(LedgerTransactionRepository transactionRepository, DailyLedgerClosureRepository closureRepository,
                         PatientRepository patientRepository, UserRepository userRepository) {
        this.transactionRepository = transactionRepository;
        this.closureRepository = closureRepository;
        this.patientRepository = patientRepository;
        this.userRepository = userRepository;
    }

    public List<Map<String, Object>> list(AuthUser user, LocalDate startDate, LocalDate endDate, String type,
                                          String source, String paymentMode, String status, UUID patientId, UUID createdBy) {
        UUID effectiveCreatedBy = createdBy;
        if (!user.isAdminOrDoctor()) {
            effectiveCreatedBy = user.id();
        }
        return transactionRepository.search(startDate, endDate, type, source, paymentMode, status, patientId, effectiveCreatedBy)
                .stream().map(this::view).toList();
    }

    @Transactional
    public Map<String, Object> create(CreateTransactionRequest req, UUID userId) {
        if (req.transactionDate() == null || isBlank(req.transactionType()) || isBlank(req.source())
                || req.amount() == null || isBlank(req.paymentMode()) || isBlank(req.description())) {
            throw ApiException.badRequest("Missing required fields");
        }
        if (req.amount().signum() <= 0) throw ApiException.badRequest("Amount must be greater than 0");
        if (!List.of("credit", "debit").contains(req.transactionType())) throw ApiException.badRequest("Invalid transaction type");
        if (!SOURCES.contains(req.source())) throw ApiException.badRequest("Invalid source");
        if (!PAYMENT_MODES.contains(req.paymentMode())) throw ApiException.badRequest("Invalid payment mode");
        if ("upi".equals(req.paymentMode()) && isBlank(req.referenceNumber())) {
            throw ApiException.badRequest("Reference number required for UPI payments");
        }
        if (transactionRepository.existsByTransactionDateAndStatus(req.transactionDate(), "day_closed")) {
            throw ApiException.badRequest("Cannot create transaction for " + req.transactionDate() + ". The day has been closed.");
        }
        LedgerTransaction txn = new LedgerTransaction();
        txn.setTransactionDate(req.transactionDate());
        txn.setTransactionType(req.transactionType());
        txn.setSource(req.source());
        txn.setAmount(req.amount());
        txn.setPaymentMode(req.paymentMode());
        txn.setReferenceNumber(req.referenceNumber());
        txn.setPatientId(req.patientId());
        txn.setDescription(req.description());
        txn.setNotes(req.notes());
        txn.setCreatedBy(userId);
        txn.setStatus("pending");
        LedgerTransaction saved = transactionRepository.save(txn);
        return Map.of("success", true, "message", "Transaction created successfully", "data", view(saved));
    }

    @Transactional
    public Map<String, Object> update(UUID id, AuthUser user, UpdateTransactionRequest req) {
        LedgerTransaction txn = require(id);
        if ("day_closed".equals(txn.getStatus())) throw ApiException.badRequest("Cannot update closed transaction");
        if (!user.isAdminOrDoctor() && !user.id().equals(txn.getCreatedBy())) throw ApiException.forbidden("Forbidden");

        if (req.amount() != null) {
            if (req.amount().signum() <= 0) throw ApiException.badRequest("Amount must be greater than 0");
            txn.setAmount(req.amount());
        }
        if (req.paymentMode() != null) {
            if (!PAYMENT_MODES.contains(req.paymentMode())) throw ApiException.badRequest("Invalid payment mode");
            txn.setPaymentMode(req.paymentMode());
        }
        if (req.referenceNumber() != null) txn.setReferenceNumber(req.referenceNumber().isBlank() ? null : req.referenceNumber());
        if (req.description() != null) {
            if (req.description().isBlank()) throw ApiException.badRequest("Description cannot be empty");
            txn.setDescription(req.description());
        }
        if (req.notes() != null) txn.setNotes(req.notes().isBlank() ? null : req.notes());

        if ("upi".equals(txn.getPaymentMode()) && isBlank(txn.getReferenceNumber())) {
            throw ApiException.badRequest("Reference number required for UPI payments");
        }
        return Map.of("success", true, "message", "Transaction updated successfully", "data", view(transactionRepository.save(txn)));
    }

    @Transactional
    public Map<String, Object> delete(UUID id, AuthUser user) {
        LedgerTransaction txn = require(id);
        if ("day_closed".equals(txn.getStatus())) throw ApiException.badRequest("Cannot delete closed transaction");
        if (!user.isAdminOrDoctor() && !user.id().equals(txn.getCreatedBy())) throw ApiException.forbidden("Forbidden");
        transactionRepository.delete(txn);
        return Map.of("success", true, "message", "Transaction deleted successfully");
    }

    @Transactional
    public Map<String, Object> updateStatus(UUID id, String status, UUID userId) {
        if (!List.of("pending", "verified").contains(status)) {
            throw ApiException.badRequest("Invalid status. Must be pending or verified.");
        }
        LedgerTransaction txn = require(id);
        if ("day_closed".equals(txn.getStatus())) throw ApiException.badRequest("Cannot update status of closed transaction");
        txn.setStatus(status);
        if ("verified".equals(status)) {
            txn.setVerifiedAt(Instant.now());
            txn.setVerifiedBy(userId);
        } else {
            txn.setVerifiedAt(null);
            txn.setVerifiedBy(null);
        }
        return Map.of("success", true, "message", "Transaction status updated", "data", view(transactionRepository.save(txn)));
    }

    public Map<String, Object> dailySummary(LocalDate date, UUID userId) {
        List<LedgerTransaction> txns = transactionRepository.findByTransactionDateAndCreatedByOrderByCreatedAtDesc(date, userId);
        BigDecimal credits = BigDecimal.ZERO, debits = BigDecimal.ZERO;
        BigDecimal cash = BigDecimal.ZERO, upi = BigDecimal.ZERO, card = BigDecimal.ZERO, bank = BigDecimal.ZERO, cheque = BigDecimal.ZERO;
        int creditCount = 0, debitCount = 0;
        boolean dayClosed = false;
        for (LedgerTransaction t : txns) {
            if ("credit".equals(t.getTransactionType())) {
                credits = credits.add(t.getAmount());
                creditCount++;
                switch (t.getPaymentMode()) {
                    case "cash" -> cash = cash.add(t.getAmount());
                    case "upi" -> upi = upi.add(t.getAmount());
                    case "card" -> card = card.add(t.getAmount());
                    case "bank_transfer" -> bank = bank.add(t.getAmount());
                    case "cheque" -> cheque = cheque.add(t.getAmount());
                    default -> { }
                }
            } else if ("debit".equals(t.getTransactionType())) {
                debits = debits.add(t.getAmount());
                debitCount++;
            }
            if ("day_closed".equals(t.getStatus())) dayClosed = true;
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("date", date);
        summary.put("total_credits", credits);
        summary.put("total_debits", debits);
        summary.put("net_balance", credits.subtract(debits));
        summary.put("total_credits_cash", cash);
        summary.put("total_credits_upi", upi);
        summary.put("total_credits_card", card);
        summary.put("total_credits_other", bank.add(cheque));
        summary.put("credit_count", creditCount);
        summary.put("debit_count", debitCount);
        summary.put("transaction_count", txns.size());
        summary.put("payment_mode_summary", Map.of("cash", cash, "upi", upi, "card", card, "bank_transfer", bank, "cheque", cheque));
        summary.put("transactions", txns.stream().map(this::view).toList());
        summary.put("is_day_closed", dayClosed);
        return Map.of("success", true, "data", summary);
    }

    @Transactional
    public Map<String, Object> closeDay(LocalDate closureDate, BigDecimal openingBalance, String notes, UUID userId) {
        if (closureDate == null) throw ApiException.badRequest("closure_date is required");
        if (closureRepository.existsByClosureDate(closureDate)) throw ApiException.badRequest("This date has already been closed");
        List<LedgerTransaction> txns = transactionRepository.findByTransactionDate(closureDate);
        if (txns.isEmpty()) throw ApiException.notFound("No transactions found for this date");

        BigDecimal credits = BigDecimal.ZERO, debits = BigDecimal.ZERO;
        BigDecimal cash = BigDecimal.ZERO, upi = BigDecimal.ZERO, bank = BigDecimal.ZERO, cheque = BigDecimal.ZERO;
        int creditCount = 0, debitCount = 0;
        for (LedgerTransaction t : txns) {
            if ("credit".equals(t.getTransactionType())) {
                credits = credits.add(t.getAmount());
                creditCount++;
                switch (t.getPaymentMode()) {
                    case "cash" -> cash = cash.add(t.getAmount());
                    case "upi" -> upi = upi.add(t.getAmount());
                    case "bank_transfer" -> bank = bank.add(t.getAmount());
                    case "cheque" -> cheque = cheque.add(t.getAmount());
                    default -> { }
                }
            } else if ("debit".equals(t.getTransactionType())) {
                debits = debits.add(t.getAmount());
                debitCount++;
            }
        }
        BigDecimal netBalance = credits.subtract(debits);
        BigDecimal opening = openingBalance != null ? openingBalance : BigDecimal.ZERO;
        BigDecimal closing = opening.add(netBalance);

        txns.forEach(t -> t.setStatus("day_closed"));
        transactionRepository.saveAll(txns);

        DailyLedgerClosure closure = new DailyLedgerClosure();
        closure.setClosureDate(closureDate);
        closure.setTotalCredits(credits);
        closure.setTotalDebits(debits);
        closure.setNetBalance(netBalance);
        closure.setTotalCreditsCash(cash);
        closure.setTotalCreditsUpi(upi);
        closure.setTotalCreditsOther(bank.add(cheque));
        closure.setTransactionCount(txns.size());
        closure.setCreditCount(creditCount);
        closure.setDebitCount(debitCount);
        closure.setClosedBy(userId);
        closure.setNotes(notes);
        closure.setOpeningBalance(opening);
        closure.setClosingBalance(closing);
        DailyLedgerClosure saved = closureRepository.save(closure);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("closure_date", closureDate);
        data.put("totalCredits", credits);
        data.put("totalDebits", debits);
        data.put("netBalance", netBalance);
        data.put("closingBalance", closing);
        data.put("transactionCount", txns.size());
        data.put("creditCount", creditCount);
        data.put("debitCount", debitCount);
        data.put("closedAt", saved.getClosedAt());
        data.put("closedBy", userId);
        return Map.of("success", true, "message", "Daily ledger closed successfully", "data", data);
    }

    @Transactional
    public Map<String, Object> closeEmployeeDay(UUID employeeId, LocalDate settlementDate, String notes) {
        if (employeeId == null || settlementDate == null) throw ApiException.badRequest("employee_id and settlement_date are required");
        List<LedgerTransaction> txns = transactionRepository.findByCreatedByAndTransactionDate(employeeId, settlementDate);
        if (txns.isEmpty()) throw ApiException.notFound("No transactions found for this employee on this date");
        if (txns.stream().anyMatch(t -> "day_closed".equals(t.getStatus()))) {
            throw ApiException.badRequest("This employee day has already been closed");
        }
        BigDecimal credits = BigDecimal.ZERO, debits = BigDecimal.ZERO;
        for (LedgerTransaction t : txns) {
            if ("credit".equals(t.getTransactionType())) credits = credits.add(t.getAmount());
            else if ("debit".equals(t.getTransactionType())) debits = debits.add(t.getAmount());
            t.setStatus("day_closed");
            t.setNotes(notes != null ? notes : "Marked as paid");
        }
        transactionRepository.saveAll(txns);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("employee_id", employeeId);
        data.put("settlement_date", settlementDate);
        data.put("totalCredits", credits);
        data.put("totalDebits", debits);
        data.put("netBalance", credits.subtract(debits));
        data.put("transactionsClosed", txns.size());
        return Map.of("success", true, "message", "Employee marked as paid successfully", "data", data);
    }

    public Map<String, Object> employeeShiftSummary(LocalDate date) {
        LocalDate effective = date != null ? date : LocalDate.now();
        List<LedgerTransaction> txns = transactionRepository.findByTransactionDateOrderByCreatedAtDesc(effective);
        Map<UUID, Map<String, Object>> byEmployee = new LinkedHashMap<>();
        for (LedgerTransaction t : txns) {
            Map<String, Object> emp = byEmployee.computeIfAbsent(t.getCreatedBy(), id -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("employeeId", id);
                m.put("employeeName", userRepository.findById(id).map(User::getUsername).orElse("Unknown"));
                m.put("totalCredits", BigDecimal.ZERO);
                m.put("totalDebits", BigDecimal.ZERO);
                m.put("creditCount", 0);
                m.put("debitCount", 0);
                m.put("transactionCount", 0);
                m.put("isClosed", false);
                m.put("transactions", new ArrayList<Map<String, Object>>());
                return m;
            });
            if ("credit".equals(t.getTransactionType())) {
                emp.put("totalCredits", ((BigDecimal) emp.get("totalCredits")).add(t.getAmount()));
                emp.put("creditCount", (int) emp.get("creditCount") + 1);
            } else if ("debit".equals(t.getTransactionType())) {
                emp.put("totalDebits", ((BigDecimal) emp.get("totalDebits")).add(t.getAmount()));
                emp.put("debitCount", (int) emp.get("debitCount") + 1);
            }
            emp.put("transactionCount", (int) emp.get("transactionCount") + 1);
            //noinspection unchecked
            ((List<Map<String, Object>>) emp.get("transactions")).add(view(t));
            if ("day_closed".equals(t.getStatus())) emp.put("isClosed", true);
        }
        List<Map<String, Object>> summaries = byEmployee.values().stream().map(emp -> {
            emp.put("netBalance", ((BigDecimal) emp.get("totalCredits")).subtract((BigDecimal) emp.get("totalDebits")));
            return emp;
        }).toList();
        return Map.of("success", true, "data", Map.of("settlementDate", effective, "employeeSummaries", summaries));
    }

    private LedgerTransaction require(UUID id) {
        return transactionRepository.findById(id).orElseThrow(() -> ApiException.notFound("Transaction not found"));
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private Map<String, Object> view(LedgerTransaction t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("transaction_date", t.getTransactionDate());
        m.put("transaction_type", t.getTransactionType());
        m.put("source", t.getSource());
        m.put("amount", t.getAmount());
        m.put("payment_mode", t.getPaymentMode());
        m.put("reference_number", t.getReferenceNumber());
        m.put("patient_id", t.getPatientId());
        m.put("description", t.getDescription());
        m.put("notes", t.getNotes());
        m.put("status", t.getStatus());
        m.put("created_by", t.getCreatedBy());
        m.put("verified_at", t.getVerifiedAt());
        m.put("verified_by", t.getVerifiedBy());
        m.put("created_at", t.getCreatedAt());
        m.put("created_by_user", brief(t.getCreatedBy()));
        m.put("verified_by_user", brief(t.getVerifiedBy()));
        Patient patient = t.getPatientId() == null ? null : patientRepository.findById(t.getPatientId()).orElse(null);
        m.put("patient", patient == null ? null : Map.of("id", patient.getId(), "name", patient.getName()));
        return m;
    }

    private UserBrief brief(UUID id) {
        if (id == null) return null;
        return userRepository.findById(id).map(UserBrief::of).orElse(null);
    }

    public record CreateTransactionRequest(LocalDate transactionDate, String transactionType, String source,
                                           BigDecimal amount, String paymentMode, String referenceNumber,
                                           UUID patientId, String description, String notes) {}

    public record UpdateTransactionRequest(BigDecimal amount, String paymentMode, String referenceNumber,
                                           String description, String notes) {}
}
