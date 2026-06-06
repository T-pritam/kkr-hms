package tech.pritamrao.kkrhms.patients;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tech.pritamrao.kkrhms.billing.BillingRecalculationService;
import tech.pritamrao.kkrhms.common.ApiException;
import tech.pritamrao.kkrhms.security.AuthUser;
import tech.pritamrao.kkrhms.users.UserBrief;
import tech.pritamrao.kkrhms.users.UserRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/patients/{patientId}/charges")
public class PatientChargeController {

    private final PatientChargeRepository chargeRepository;
    private final UserRepository userRepository;
    private final BillingRecalculationService billingRecalc;

    public PatientChargeController(PatientChargeRepository chargeRepository, UserRepository userRepository,
                                   BillingRecalculationService billingRecalc) {
        this.chargeRepository = chargeRepository;
        this.userRepository = userRepository;
        this.billingRecalc = billingRecalc;
    }

    // 'users' matches the original Supabase embed key (users!created_by) the UI reads.
    public record ChargeView(UUID id, UUID patientBillingId, UUID patientId, String chargeType, String description,
                             BigDecimal amount, LocalDate chargeDate, Integer qty, UUID createdBy,
                             Instant createdAt, UserBrief users) {}

    public record ChargeRequest(UUID patientBillingId, String chargeType, String description,
                                BigDecimal amount, LocalDate chargeDate, Integer qty) {}

    @GetMapping
    public List<ChargeView> list(@PathVariable UUID patientId,
                                 @RequestParam(name = "billing_id", required = false) UUID billingId) {
        List<PatientCharge> charges = billingId != null
                ? chargeRepository.findByPatientIdAndPatientBillingIdOrderByChargeDateDesc(patientId, billingId)
                : chargeRepository.findByPatientIdOrderByChargeDateDesc(patientId);
        return charges.stream().map(this::toView).toList();
    }

    @PostMapping
    public ChargeView create(@PathVariable UUID patientId, @RequestBody ChargeRequest req,
                             @AuthenticationPrincipal AuthUser user) {
        PatientCharge charge = new PatientCharge();
        charge.setPatientId(patientId);
        charge.setPatientBillingId(req.patientBillingId());
        charge.setChargeType(req.chargeType());
        charge.setDescription(req.description());
        charge.setAmount(req.amount());
        charge.setChargeDate(req.chargeDate() != null ? req.chargeDate() : LocalDate.now());
        charge.setQty(req.qty() != null ? req.qty() : 1);
        charge.setCreatedBy(user.id());
        PatientCharge saved = chargeRepository.save(charge);
        if (req.patientBillingId() != null) billingRecalc.recalculate(req.patientBillingId());
        return toView(saved);
    }

    @PatchMapping("/{chargeId}")
    public ChargeView update(@PathVariable UUID chargeId, @RequestBody ChargeRequest req,
                             @AuthenticationPrincipal AuthUser user) {
        PatientCharge charge = chargeRepository.findById(chargeId)
                .orElseThrow(() -> ApiException.notFound("Charge not found"));
        requireAdminOrOwner(user, charge.getCreatedBy());
        if (req.chargeType() != null) charge.setChargeType(req.chargeType());
        charge.setDescription(req.description());
        if (req.amount() != null) charge.setAmount(req.amount());
        if (req.chargeDate() != null) charge.setChargeDate(req.chargeDate());
        if (req.qty() != null) charge.setQty(req.qty());
        charge.setUpdatedBy(user.id());
        PatientCharge saved = chargeRepository.save(charge);
        if (charge.getPatientBillingId() != null) billingRecalc.recalculate(charge.getPatientBillingId());
        return toView(saved);
    }

    @DeleteMapping("/{chargeId}")
    public Map<String, Object> delete(@PathVariable UUID chargeId, @AuthenticationPrincipal AuthUser user) {
        PatientCharge charge = chargeRepository.findById(chargeId)
                .orElseThrow(() -> ApiException.notFound("Charge not found"));
        requireAdminOrOwner(user, charge.getCreatedBy());
        UUID billingId = charge.getPatientBillingId();
        chargeRepository.delete(charge);
        if (billingId != null) billingRecalc.recalculate(billingId);
        return Map.of("message", "Charge deleted successfully");
    }

    private void requireAdminOrOwner(AuthUser user, UUID createdBy) {
        if (!user.isAdmin() && !user.id().equals(createdBy)) {
            throw ApiException.forbidden("Forbidden");
        }
    }

    private ChargeView toView(PatientCharge c) {
        UserBrief creator = c.getCreatedBy() == null ? null
                : userRepository.findById(c.getCreatedBy()).map(UserBrief::of).orElse(null);
        return new ChargeView(c.getId(), c.getPatientBillingId(), c.getPatientId(), c.getChargeType(),
                c.getDescription(), c.getAmount(), c.getChargeDate(), c.getQty(), c.getCreatedBy(),
                c.getCreatedAt(), creator);
    }
}
