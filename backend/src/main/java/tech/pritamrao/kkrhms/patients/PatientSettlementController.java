package tech.pritamrao.kkrhms.patients;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tech.pritamrao.kkrhms.common.ApiException;
import tech.pritamrao.kkrhms.doctors.DoctorSettlementService;
import tech.pritamrao.kkrhms.doctors.SettlementView;
import tech.pritamrao.kkrhms.security.AuthUser;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/patients/{patientId}/settlements")
public class PatientSettlementController {

    private final DoctorSettlementService service;

    public PatientSettlementController(DoctorSettlementService service) {
        this.service = service;
    }

    public record CreateSettlementRequest(UUID patientBillingId, UUID doctorId, Integer visitCount, BigDecimal amountPerVisit) {}

    public record SettleRequest(UUID settlementId, Instant settlementDate, BigDecimal settlementAmount,
                                String settlementNotes, String paymentMethod, String transactionReference) {}

    public record SyncRequest(UUID billingId) {}

    @GetMapping
    public List<SettlementView> list(@RequestParam(name = "billing_id") UUID billingId) {
        if (billingId == null) throw ApiException.badRequest("billing_id is required");
        return service.listByBilling(billingId);
    }

    @PostMapping
    public SettlementView create(@PathVariable UUID patientId, @RequestBody CreateSettlementRequest req,
                                 @AuthenticationPrincipal AuthUser user) {
        return service.createForPatient(patientId, req.patientBillingId(), req.doctorId(),
                req.visitCount(), req.amountPerVisit(), user.id());
    }

    @PatchMapping
    @PreAuthorize("hasRole('ADMIN')")
    public SettlementView settle(@RequestBody SettleRequest req, @AuthenticationPrincipal AuthUser user) {
        return service.settleViaPatch(req.settlementId(), req.settlementDate(), req.settlementAmount(),
                req.settlementNotes(), req.paymentMethod(), req.transactionReference(), user.id());
    }

    @PostMapping("/sync")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> sync(@PathVariable UUID patientId, @RequestBody SyncRequest req,
                                    @AuthenticationPrincipal AuthUser user) {
        return service.sync(patientId, req.billingId(), user.id());
    }
}
