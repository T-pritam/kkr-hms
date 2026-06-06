package tech.pritamrao.kkrhms.controller;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import tech.pritamrao.kkrhms.security.AuthUser;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/patients/{patientId}/billing")
public class PatientBillingController {

    private final PatientBillingRepository billingRepository;
    private final PatientRepository patientRepository;
    private final ReferralRepository referralRepository;
    private final BillingRecalculationService billingRecalc;

    public PatientBillingController(PatientBillingRepository billingRepository, PatientRepository patientRepository,
                                    ReferralRepository referralRepository, BillingRecalculationService billingRecalc) {
        this.billingRepository = billingRepository;
        this.patientRepository = patientRepository;
        this.referralRepository = referralRepository;
        this.billingRecalc = billingRecalc;
    }

    public record ReferralBrief(UUID id, String name, String phone, String status) {}

    public record CreateBillingRequest(BigDecimal baseCharge, BigDecimal referralCommissionAmount, String referralId) {}

    public record UpdateBillingRequest(
            UUID billingId, BigDecimal baseCharge, BigDecimal referralCommissionAmount,
            String referralSettlementNotes, String referralSettlementPaymentMethod,
            String referralSettlementTransactionRef, Boolean referralSettled, Instant referralSettlementDate,
            String referralId) {}

    @GetMapping
    public Map<String, Object> get(@PathVariable UUID patientId) {
        Patient patient = patientRepository.findById(patientId)
                .orElseThrow(() -> ApiException.notFound("Patient not found"));
        var billings = billingRepository.findByPatientIdOrderByCreatedAtDesc(patientId)
                .stream().map(BillingView::of).toList();
        ReferralBrief referral = resolveReferral(patient.getReferredBy());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("billings", billings);
        body.put("referral", referral);
        return body;
    }

    @PostMapping
    public BillingView create(@PathVariable UUID patientId, @RequestBody CreateBillingRequest req,
                              @AuthenticationPrincipal AuthUser user) {
        Patient patient = patientRepository.findById(patientId)
                .orElseThrow(() -> ApiException.notFound("Patient not found"));
        LocalDate joinDate = patient.getDateOfJoin() != null ? patient.getDateOfJoin() : LocalDate.now();

        PatientBilling billing = new PatientBilling();
        billing.setPatientId(patientId);
        billing.setBaseCharge(req.baseCharge() != null ? req.baseCharge() : BigDecimal.ZERO);
        billing.setReferralCommissionAmount(req.referralCommissionAmount() != null ? req.referralCommissionAmount() : BigDecimal.ZERO);
        billing.setJoinedDate(joinDate);
        billing.setMonthYear(joinDate.toString().substring(0, 7));
        billing.setCreatedBy(user.id());
        PatientBilling saved = billingRepository.save(billing);

        if (req.referralId() != null) {
            patient.setReferredBy(req.referralId());
            patientRepository.save(patient);
        }
        return BillingView.of(saved);
    }

    @PatchMapping
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public BillingView update(@PathVariable UUID patientId, @RequestBody UpdateBillingRequest req,
                              @AuthenticationPrincipal AuthUser user) {
        if (req.billingId() == null) {
            throw ApiException.badRequest("billing_id is required");
        }
        PatientBilling billing = billingRepository.findById(req.billingId())
                .orElseThrow(() -> ApiException.notFound("Billing not found"));

        if (req.referralCommissionAmount() != null) billing.setReferralCommissionAmount(req.referralCommissionAmount());
        if (req.referralSettlementNotes() != null) billing.setReferralSettlementNotes(req.referralSettlementNotes());
        if (req.referralSettlementPaymentMethod() != null) billing.setReferralSettlementPaymentMethod(req.referralSettlementPaymentMethod());
        if (req.referralSettlementTransactionRef() != null) billing.setReferralTransactionRef(req.referralSettlementTransactionRef());
        if (req.referralSettled() != null) billing.setReferralSettled(req.referralSettled());
        if (req.referralSettlementDate() != null) billing.setReferralSettlementDate(req.referralSettlementDate());
        if (req.baseCharge() != null) billing.setBaseCharge(req.baseCharge());
        billing.setUpdatedBy(user.id());
        PatientBilling saved = billingRepository.save(billing);

        if (req.referralId() != null) {
            patientRepository.findById(patientId).ifPresent(p -> {
                p.setReferredBy(req.referralId());
                patientRepository.save(p);
            });
        }
        if (req.baseCharge() != null || req.referralCommissionAmount() != null) {
            billingRecalc.recalculate(req.billingId());
            saved = billingRepository.findById(req.billingId()).orElse(saved);
        }
        return BillingView.of(saved);
    }

    private ReferralBrief resolveReferral(String referredBy) {
        if (referredBy == null || referredBy.isBlank()) return null;
        try {
            Referral r = referralRepository.findById(UUID.fromString(referredBy)).orElse(null);
            return r == null ? null : new ReferralBrief(r.getId(), r.getName(), r.getPhone(), r.getStatus());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
