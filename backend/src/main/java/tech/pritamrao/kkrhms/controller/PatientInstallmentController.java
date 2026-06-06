package tech.pritamrao.kkrhms.controller;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import tech.pritamrao.kkrhms.security.AuthUser;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/patients/{patientId}/installments")
public class PatientInstallmentController {

    private final PatientBillingInstallmentRepository installmentRepository;
    private final PatientBillingRepository billingRepository;
    private final LedgerTransactionRepository ledgerRepository;
    private final UserRepository userRepository;

    public PatientInstallmentController(PatientBillingInstallmentRepository installmentRepository,
                                        PatientBillingRepository billingRepository,
                                        LedgerTransactionRepository ledgerRepository,
                                        UserRepository userRepository) {
        this.installmentRepository = installmentRepository;
        this.billingRepository = billingRepository;
        this.ledgerRepository = ledgerRepository;
        this.userRepository = userRepository;
    }

    // 'users' matches the original Supabase embed key (users!created_by) the UI reads.
    public record InstallmentView(UUID id, UUID patientBillingId, Integer installmentNumber, BigDecimal amount,
                                  LocalDate paymentDate, String paymentMethod, String transactionReference,
                                  String remarks, UUID createdBy, Instant createdAt, UserBrief users) {}

    public record InstallmentRequest(UUID patientBillingId, BigDecimal amount, LocalDate paymentDate,
                                     String paymentMethod, String transactionReference, String remarks,
                                     Boolean createLedgerEntry) {}

    @GetMapping
    public List<InstallmentView> list(@RequestParam(name = "billing_id") UUID billingId) {
        if (billingId == null) throw ApiException.badRequest("billing_id is required");
        return installmentRepository.findByPatientBillingIdOrderByInstallmentNumberAsc(billingId)
                .stream().map(this::toView).toList();
    }

    @PostMapping
    @Transactional
    public InstallmentView create(@PathVariable UUID patientId, @RequestBody InstallmentRequest req,
                                  @AuthenticationPrincipal AuthUser user) {
        int next = installmentRepository.findByPatientBillingIdOrderByInstallmentNumberAsc(req.patientBillingId())
                .stream().mapToInt(PatientBillingInstallment::getInstallmentNumber).max().orElse(0) + 1;

        PatientBillingInstallment inst = new PatientBillingInstallment();
        inst.setPatientBillingId(req.patientBillingId());
        inst.setInstallmentNumber(next);
        inst.setAmount(req.amount());
        inst.setPaymentDate(req.paymentDate() != null ? req.paymentDate() : LocalDate.now());
        inst.setPaymentMethod(req.paymentMethod() != null ? req.paymentMethod() : "cash");
        inst.setTransactionReference(req.transactionReference());
        inst.setRemarks(req.remarks());
        inst.setCreatedBy(user.id());
        PatientBillingInstallment saved = installmentRepository.save(inst);

        recalcPaidAmount(req.patientBillingId());

        if (Boolean.TRUE.equals(req.createLedgerEntry())) {
            LedgerTransaction txn = new LedgerTransaction();
            txn.setTransactionDate(inst.getPaymentDate());
            txn.setTransactionType("credit");
            txn.setSource("patient");
            txn.setAmount(req.amount());
            txn.setPaymentMode(inst.getPaymentMethod());
            txn.setReferenceNumber(req.transactionReference());
            txn.setPatientId(patientId);
            txn.setDescription("Patient installment payment #" + next);
            txn.setNotes(req.remarks());
            txn.setStatus("pending");
            txn.setCreatedBy(user.id());
            ledgerRepository.save(txn);
        }
        return toView(saved);
    }

    @PatchMapping("/{installmentId}")
    @Transactional
    public InstallmentView update(@PathVariable UUID installmentId, @RequestBody InstallmentRequest req,
                                  @AuthenticationPrincipal AuthUser user) {
        PatientBillingInstallment inst = installmentRepository.findById(installmentId)
                .orElseThrow(() -> ApiException.notFound("Installment not found"));
        requireAdminOrOwner(user, inst.getCreatedBy());
        if (req.amount() != null) inst.setAmount(req.amount());
        if (req.paymentDate() != null) inst.setPaymentDate(req.paymentDate());
        if (req.paymentMethod() != null) inst.setPaymentMethod(req.paymentMethod());
        inst.setTransactionReference(req.transactionReference());
        inst.setRemarks(req.remarks());
        inst.setUpdatedBy(user.id());
        PatientBillingInstallment saved = installmentRepository.save(inst);
        recalcPaidAmount(inst.getPatientBillingId());
        return toView(saved);
    }

    @DeleteMapping("/{installmentId}")
    @Transactional
    public Map<String, Object> delete(@PathVariable UUID installmentId, @AuthenticationPrincipal AuthUser user) {
        PatientBillingInstallment inst = installmentRepository.findById(installmentId)
                .orElseThrow(() -> ApiException.notFound("Installment not found"));
        requireAdminOrOwner(user, inst.getCreatedBy());
        UUID billingId = inst.getPatientBillingId();
        installmentRepository.delete(inst);
        recalcPaidAmount(billingId);
        return Map.of("success", true);
    }

    private void recalcPaidAmount(UUID billingId) {
        BigDecimal totalPaid = installmentRepository.findByPatientBillingIdOrderByInstallmentNumberAsc(billingId)
                .stream().map(PatientBillingInstallment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        billingRepository.findById(billingId).ifPresent(b -> {
            b.setPatientPaidAmount(totalPaid);
            billingRepository.save(b);
        });
    }

    private void requireAdminOrOwner(AuthUser user, UUID createdBy) {
        if (!user.isAdmin() && !user.id().equals(createdBy)) {
            throw ApiException.forbidden("Forbidden");
        }
    }

    private InstallmentView toView(PatientBillingInstallment i) {
        UserBrief creator = i.getCreatedBy() == null ? null
                : userRepository.findById(i.getCreatedBy()).map(UserBrief::of).orElse(null);
        return new InstallmentView(i.getId(), i.getPatientBillingId(), i.getInstallmentNumber(), i.getAmount(),
                i.getPaymentDate(), i.getPaymentMethod(), i.getTransactionReference(), i.getRemarks(),
                i.getCreatedBy(), i.getCreatedAt(), creator);
    }
}
