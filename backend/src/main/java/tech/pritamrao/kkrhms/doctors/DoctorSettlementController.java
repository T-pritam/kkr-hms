package tech.pritamrao.kkrhms.doctors;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tech.pritamrao.kkrhms.security.AuthUser;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Top-level settlement operations — all admin-only (financial). */
@RestController
@RequestMapping("/doctor-settlements")
@PreAuthorize("hasRole('ADMIN')")
public class DoctorSettlementController {

    private final DoctorSettlementService service;

    public DoctorSettlementController(DoctorSettlementService service) {
        this.service = service;
    }

    public record DeleteRequest(Boolean softDelete) {}

    @PutMapping("/{settlementId}")
    public Map<String, Object> update(@PathVariable UUID settlementId,
                                      @RequestBody DoctorSettlementService.SettlementUpdate body,
                                      @AuthenticationPrincipal AuthUser user) {
        return service.update(settlementId, body, user.id());
    }

    @DeleteMapping("/{settlementId}")
    public Map<String, Object> delete(@PathVariable UUID settlementId,
                                      @RequestBody(required = false) DeleteRequest body) {
        boolean soft = body == null || body.softDelete() == null || body.softDelete();
        return service.delete(settlementId, soft);
    }

    @PostMapping("/settle")
    public Map<String, Object> settle(@RequestBody DoctorSettlementService.SettleRequest body,
                                      @AuthenticationPrincipal AuthUser user) {
        return service.settle(body, user.id());
    }

    @PostMapping("/create-manual")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Map<String, Object> createManual(@RequestBody DoctorSettlementService.ManualRequest body,
                                            @AuthenticationPrincipal AuthUser user) {
        return service.createManual(body, user.id());
    }

    @PostMapping("/merge")
    public Map<String, Object> merge(@RequestBody MergeRequest body, @AuthenticationPrincipal AuthUser user) {
        return service.merge(body.settlementIds(), body.mergedSettlement(), user.id());
    }

    public record MergeRequest(List<UUID> settlementIds, DoctorSettlementService.ManualRequest mergedSettlement) {}
}
