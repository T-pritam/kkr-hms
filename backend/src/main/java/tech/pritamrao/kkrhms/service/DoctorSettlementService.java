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
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Owns all {@code doctor_visit_settlements} business logic shared by the
 * patient-scoped and the top-level settlement endpoints. Whenever visit counts or
 * per-visit pricing change, {@code total_amount} is recomputed so the billing
 * recalculation stays correct (the original schema has no DB trigger for it).
 */
@Service
public class DoctorSettlementService {

    private final DoctorVisitSettlementRepository settlementRepository;
    private final DoctorRepository doctorRepository;
    private final PatientRepository patientRepository;
    private final PatientConsultationRepository consultationRepository;
    private final BillingRecalculationService billingRecalc;

    public DoctorSettlementService(DoctorVisitSettlementRepository settlementRepository,
                                   DoctorRepository doctorRepository,
                                   PatientRepository patientRepository,
                                   PatientConsultationRepository consultationRepository,
                                   BillingRecalculationService billingRecalc) {
        this.settlementRepository = settlementRepository;
        this.doctorRepository = doctorRepository;
        this.patientRepository = patientRepository;
        this.consultationRepository = consultationRepository;
        this.billingRecalc = billingRecalc;
    }

    public List<SettlementView> listByBilling(UUID billingId) {
        return settlementRepository.findByPatientBillingIdOrderByCreatedAtDesc(billingId).stream()
                .map(this::toView).toList();
    }

    public List<SettlementView> listAll(Boolean settled, UUID doctorId, UUID patientId) {
        return settlementRepository.findByDeletedAtIsNullOrderByCreatedAtDesc().stream()
                .filter(s -> settled == null || settled.equals(s.getSettled()))
                .filter(s -> doctorId == null || doctorId.equals(s.getDoctorId()))
                .filter(s -> patientId == null || patientId.equals(s.getPatientId()))
                .map(this::toView).toList();
    }

    @Transactional
    public SettlementView createForPatient(UUID patientId, UUID billingId, UUID doctorId,
                                           Integer visitCount, BigDecimal amountPerVisit, UUID userId) {
        DoctorVisitSettlement s = new DoctorVisitSettlement();
        s.setPatientId(patientId);
        s.setPatientBillingId(billingId);
        s.setDoctorId(doctorId);
        s.setVisitCount(visitCount != null ? visitCount : 0);
        s.setAmountPerVisit(amountPerVisit != null ? amountPerVisit : BigDecimal.ZERO);
        s.setTotalAmount(total(s.getVisitCount(), s.getAmountPerVisit()));
        s.setCreatedBy(userId);
        DoctorVisitSettlement saved = settlementRepository.save(s);
        billingRecalc.recalculate(billingId);
        return toView(saved);
    }

    @Transactional
    public SettlementView settleViaPatch(UUID settlementId, Instant settlementDate, BigDecimal settlementAmount,
                                         String settlementNotes, String paymentMethod, String transactionReference,
                                         UUID userId) {
        DoctorVisitSettlement s = require(settlementId);
        s.setSettled(true);
        s.setSettlementDate(settlementDate != null ? settlementDate : Instant.now());
        s.setSettlementAmount(settlementAmount);
        s.setSettlementNotes(settlementNotes);
        s.setPaymentMethod(paymentMethod);
        s.setTransactionReference(transactionReference);
        s.setUpdatedBy(userId);
        DoctorVisitSettlement saved = settlementRepository.save(s);
        billingRecalc.recalculate(s.getPatientBillingId());
        return toView(saved);
    }

    /** Full update (pricing modes + settle/unsettle), mirroring the original PUT route. */
    @Transactional
    public Map<String, Object> update(UUID settlementId, SettlementUpdate body, UUID userId) {
        DoctorVisitSettlement s = require(settlementId);

        boolean pricingUpdate = body.pricingMode() != null
                || body.amountPerVisit() != null || body.visitCount() != null;
        boolean wasSettled = false;
        if (Boolean.TRUE.equals(s.getSettled()) && pricingUpdate) {
            wasSettled = true;
            s.setSettled(false);
            s.setSettlementDate(null);
            s.setSettlementAmount(null);
        }

        if ("total".equals(body.pricingMode())) {
            if (body.totalAmount() == null || body.visitCount() == null || body.visitCount() <= 0) {
                throw ApiException.badRequest("Invalid total_amount or visit_count values");
            }
            s.setVisitCount(body.visitCount());
            s.setAmountPerVisit(body.totalAmount().divide(BigDecimal.valueOf(body.visitCount()), 2, RoundingMode.HALF_UP));
        } else {
            if (body.amountPerVisit() != null) s.setAmountPerVisit(body.amountPerVisit());
            if (body.visitCount() != null) s.setVisitCount(body.visitCount());
        }
        s.setTotalAmount(total(s.getVisitCount(), s.getAmountPerVisit()));

        if (body.settled() != null) {
            s.setSettled(body.settled());
            if (Boolean.TRUE.equals(body.settled())) {
                s.setSettlementDate(body.settlementDate() != null ? body.settlementDate() : Instant.now());
                if (body.settlementAmount() == null) s.setSettlementAmount(s.getTotalAmount());
            } else {
                s.setSettlementDate(null);
                s.setSettlementAmount(null);
                s.setPaymentMethod(null);
                s.setTransactionReference(null);
            }
        }
        if (body.settlementAmount() != null) s.setSettlementAmount(body.settlementAmount());
        if (notBlank(body.paymentMethod())) s.setPaymentMethod(body.paymentMethod());
        if (notBlank(body.transactionReference())) s.setTransactionReference(body.transactionReference());
        if (notBlank(body.settlementNotes())) s.setSettlementNotes(body.settlementNotes());
        if (body.settlementType() != null) s.setSettlementType(body.settlementType());
        s.setUpdatedBy(userId);

        DoctorVisitSettlement saved = settlementRepository.save(s);
        if (saved.getPatientBillingId() != null) billingRecalc.recalculate(saved.getPatientBillingId());

        String message = wasSettled && pricingUpdate
                ? "Settled settlement was unsettled and pricing updated. Call with settled: true to resettle."
                : "Settlement updated successfully";
        return Map.of("success", true, "data", toView(saved), "message", message,
                "metadata", Map.of("wasSettled", wasSettled, "pricingUpdated", pricingUpdate,
                        "needsResettle", wasSettled && pricingUpdate));
    }

    @Transactional
    public Map<String, Object> delete(UUID settlementId, boolean softDelete) {
        DoctorVisitSettlement s = require(settlementId);
        UUID billingId = s.getPatientBillingId();
        if (softDelete) {
            s.setDeletedAt(Instant.now());
            settlementRepository.save(s);
        } else {
            settlementRepository.delete(s);
        }
        if (billingId != null) billingRecalc.recalculate(billingId);
        return Map.of("success", true,
                "message", softDelete ? "Settlement soft deleted successfully" : "Settlement deleted permanently");
    }

    @Transactional
    public Map<String, Object> settle(SettleRequest body, UUID userId) {
        if (body.settlementId() != null) {
            if (body.settlementAmount() == null || body.settlementAmount().signum() <= 0) {
                throw ApiException.badRequest("settlement_id and settlement_amount are required");
            }
            DoctorVisitSettlement s = require(body.settlementId());
            applySettle(s, body.settlementAmount(), body, userId);
            DoctorVisitSettlement saved = settlementRepository.save(s);
            if (saved.getPatientBillingId() != null) billingRecalc.recalculate(saved.getPatientBillingId());
            return Map.of("success", true, "data", toView(saved), "message", "Doctor visit fees settled successfully");
        }
        if (body.settlementIds() != null && !body.settlementIds().isEmpty()) {
            if (body.settlementAmountEach() == null || body.settlementAmountEach().signum() <= 0) {
                throw ApiException.badRequest("settlement_amount_each must be greater than 0");
            }
            List<SettlementView> settled = new ArrayList<>();
            Set<UUID> billingIds = new HashSet<>();
            for (UUID id : body.settlementIds()) {
                DoctorVisitSettlement s = settlementRepository.findById(id).orElse(null);
                if (s == null) continue;
                applySettle(s, body.settlementAmountEach(), body, userId);
                DoctorVisitSettlement saved = settlementRepository.save(s);
                settled.add(toView(saved));
                if (saved.getPatientBillingId() != null) billingIds.add(saved.getPatientBillingId());
            }
            billingIds.forEach(billingRecalc::recalculate);
            return Map.of("success", true, "settled_count", settled.size(), "data", settled,
                    "message", "Successfully settled " + settled.size() + " doctor visit(s)");
        }
        throw ApiException.badRequest("Either settlement_id or settlement_ids must be provided");
    }

    private void applySettle(DoctorVisitSettlement s, BigDecimal amount, SettleRequest body, UUID userId) {
        int visits = s.getVisitCount() != null && s.getVisitCount() > 0 ? s.getVisitCount() : 1;
        s.setSettled(true);
        s.setSettlementDate(Instant.now());
        s.setSettlementAmount(amount);
        s.setAmountPerVisit(amount.divide(BigDecimal.valueOf(visits), 2, RoundingMode.HALF_UP));
        s.setTotalAmount(amount);
        s.setPaymentMethod(body.paymentMethod());
        s.setTransactionReference(body.transactionReference());
        s.setSettlementNotes(body.settlementNotes());
        s.setSettlementType(body.settlementType() != null ? body.settlementType() : "regular");
        s.setUpdatedBy(userId);
    }

    @Transactional
    public Map<String, Object> createManual(ManualRequest body, UUID userId) {
        if (body.patientId() == null || body.doctorId() == null) {
            throw ApiException.badRequest("patient_id and doctor_id are required");
        }
        if (body.visitCount() == null || body.visitCount() < 0) throw ApiException.badRequest("visit_count must be >= 0");
        if (body.amountPerVisit() == null || body.amountPerVisit().signum() < 0) {
            throw ApiException.badRequest("amount_per_visit must be >= 0");
        }
        BigDecimal total = body.totalAmount() != null && body.totalAmount().signum() > 0
                ? body.totalAmount() : total(body.visitCount(), body.amountPerVisit());

        DoctorVisitSettlement s = new DoctorVisitSettlement();
        s.setPatientId(body.patientId());
        s.setPatientBillingId(body.patientBillingId());
        s.setDoctorId(body.doctorId());
        s.setVisitCount(body.visitCount());
        s.setAmountPerVisit(body.amountPerVisit());
        s.setTotalAmount(total);
        s.setSettlementType(body.settlementType() != null ? body.settlementType() : "regular");
        s.setSettlementNotes(body.notes());
        s.setCreatedBy(userId);
        DoctorVisitSettlement saved = settlementRepository.save(s);
        if (saved.getPatientBillingId() != null) billingRecalc.recalculate(saved.getPatientBillingId());
        return Map.of("success", true, "data", toView(saved), "message", "Manual settlement created successfully");
    }

    @Transactional
    public Map<String, Object> merge(List<UUID> ids, ManualRequest merged, UUID userId) {
        if (ids == null || ids.size() < 2) {
            throw ApiException.badRequest("Must provide at least 2 settlement IDs to merge");
        }
        List<DoctorVisitSettlement> settlements = settlementRepository.findAllById(ids);
        if (settlements.size() < 2) throw ApiException.notFound("Could not find all settlements to merge");
        if (settlements.stream().map(DoctorVisitSettlement::getPatientId).distinct().count() > 1) {
            throw ApiException.badRequest("Cannot merge settlements from different patients");
        }
        int totalVisits = settlements.stream().mapToInt(s -> s.getVisitCount() != null ? s.getVisitCount() : 0).sum();
        BigDecimal totalAmount = settlements.stream()
                .map(s -> s.getTotalAmount() != null ? s.getTotalAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        DoctorVisitSettlement first = settlements.get(0);
        DoctorVisitSettlement m = new DoctorVisitSettlement();
        m.setPatientId(first.getPatientId());
        m.setPatientBillingId(merged != null && merged.patientBillingId() != null ? merged.patientBillingId() : first.getPatientBillingId());
        m.setDoctorId(first.getDoctorId());
        m.setVisitCount(merged != null && merged.visitCount() != null ? merged.visitCount() : totalVisits);
        m.setTotalAmount(merged != null && merged.totalAmount() != null ? merged.totalAmount() : totalAmount);
        int mv = m.getVisitCount() != null && m.getVisitCount() > 0 ? m.getVisitCount() : 1;
        m.setAmountPerVisit(merged != null && merged.amountPerVisit() != null ? merged.amountPerVisit()
                : m.getTotalAmount().divide(BigDecimal.valueOf(mv), 2, RoundingMode.HALF_UP));
        m.setSettlementType(merged != null && merged.settlementType() != null ? merged.settlementType() : "regular");
        m.setSettlementNotes(merged != null && merged.notes() != null ? merged.notes()
                : "Merged from " + settlements.size() + " settlements");
        m.setCreatedBy(userId);
        DoctorVisitSettlement mergedSaved = settlementRepository.save(m);

        Instant now = Instant.now();
        settlements.forEach(s -> { s.setDeletedAt(now); });
        settlementRepository.saveAll(settlements);
        if (mergedSaved.getPatientBillingId() != null) billingRecalc.recalculate(mergedSaved.getPatientBillingId());

        return Map.of("success", true, "merged_settlement_id", mergedSaved.getId(),
                "merged_settlement", toView(mergedSaved), "deleted_settlement_ids", ids,
                "message", "Successfully merged " + settlements.size() + " settlements");
    }

    @Transactional
    public Map<String, Object> sync(UUID patientId, UUID billingId, UUID userId) {
        if (billingId == null) throw ApiException.badRequest("billing_id is required");
        List<PatientConsultation> consultations = consultationRepository
                .findByPatientIdAndBillingIdAndDeletedAtIsNullOrderByConsultationDateAsc(patientId, billingId);
        if (consultations.isEmpty()) {
            return Map.of("success", true, "message", "No consultations to sync", "settlements", List.of());
        }

        Map<UUID, Long> byDoctor = new java.util.LinkedHashMap<>();
        for (PatientConsultation c : consultations) {
            if (c.getDoctorId() == null) continue;
            byDoctor.merge(c.getDoctorId(), 1L, Long::sum);
        }

        List<Map<String, Object>> created = new ArrayList<>();
        List<Map<String, Object>> updated = new ArrayList<>();
        for (var entry : byDoctor.entrySet()) {
            UUID doctorId = entry.getKey();
            int visitCount = entry.getValue().intValue();
            List<DoctorVisitSettlement> existing = settlementRepository
                    .findByPatientIdAndDoctorIdAndDeletedAtIsNullOrderByCreatedAtDesc(patientId, doctorId);
            if (!existing.isEmpty()) {
                DoctorVisitSettlement s = existing.get(0);
                s.setVisitCount(visitCount);
                s.setTotalAmount(total(visitCount, s.getAmountPerVisit()));
                s.setUpdatedBy(userId);
                settlementRepository.save(s);
                updated.add(Map.of("id", s.getId(), "doctor_id", doctorId, "visit_count", visitCount, "status", "updated"));
            } else {
                DoctorVisitSettlement s = new DoctorVisitSettlement();
                s.setPatientId(patientId);
                s.setDoctorId(doctorId);
                s.setPatientBillingId(billingId);
                s.setVisitCount(visitCount);
                s.setAmountPerVisit(BigDecimal.ZERO);
                s.setTotalAmount(BigDecimal.ZERO);
                s.setSettlementType("regular");
                s.setCreatedBy(userId);
                DoctorVisitSettlement saved = settlementRepository.save(s);
                created.add(Map.of("id", saved.getId(), "doctor_id", doctorId, "visit_count", visitCount, "status", "created"));
            }
        }
        billingRecalc.recalculate(billingId);
        return Map.of("success", true, "created", created, "updated", updated,
                "total_doctors", byDoctor.size(),
                "message", "Doctor visits synced successfully. Created: " + created.size() + ", Updated: " + updated.size());
    }

    private DoctorVisitSettlement require(UUID id) {
        return settlementRepository.findById(id).orElseThrow(() -> ApiException.notFound("Settlement not found"));
    }

    private BigDecimal total(Integer visitCount, BigDecimal amountPerVisit) {
        int v = visitCount != null ? visitCount : 0;
        BigDecimal a = amountPerVisit != null ? amountPerVisit : BigDecimal.ZERO;
        return a.multiply(BigDecimal.valueOf(v));
    }

    private boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private SettlementView toView(DoctorVisitSettlement s) {
        Doctor doctor = s.getDoctorId() == null ? null : doctorRepository.findById(s.getDoctorId()).orElse(null);
        Patient patient = s.getPatientId() == null ? null : patientRepository.findById(s.getPatientId()).orElse(null);
        return SettlementView.of(s, doctor, patient);
    }

    // ── request payloads ──────────────────────────────────────────────────
    public record SettlementUpdate(String pricingMode, Integer visitCount, BigDecimal amountPerVisit,
                                   BigDecimal totalAmount, Boolean settled, Instant settlementDate,
                                   BigDecimal settlementAmount, String settlementNotes, String paymentMethod,
                                   String transactionReference, String settlementType) {}

    public record SettleRequest(UUID settlementId, BigDecimal settlementAmount, List<UUID> settlementIds,
                                BigDecimal settlementAmountEach, String paymentMethod, String transactionReference,
                                String settlementNotes, String settlementType) {}

    public record ManualRequest(UUID patientId, UUID patientBillingId, UUID doctorId, Integer visitCount,
                                BigDecimal amountPerVisit, BigDecimal totalAmount, String settlementType,
                                String notes, List<UUID> settlementIds) {}
}
