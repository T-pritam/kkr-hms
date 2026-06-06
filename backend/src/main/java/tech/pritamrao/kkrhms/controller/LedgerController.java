package tech.pritamrao.kkrhms.controller;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tech.pritamrao.kkrhms.security.AuthUser;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/ledger")
public class LedgerController {

    private final LedgerService service;

    public LedgerController(LedgerService service) {
        this.service = service;
    }

    @GetMapping("/transactions")
    public Map<String, Object> list(@AuthenticationPrincipal AuthUser user,
                                    @RequestParam(name = "start_date", required = false) LocalDate startDate,
                                    @RequestParam(name = "end_date", required = false) LocalDate endDate,
                                    @RequestParam(name = "transaction_type", required = false) String type,
                                    @RequestParam(required = false) String source,
                                    @RequestParam(name = "payment_mode", required = false) String paymentMode,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(name = "patient_id", required = false) UUID patientId,
                                    @RequestParam(name = "created_by", required = false) UUID createdBy) {
        List<Map<String, Object>> data = service.list(user, startDate, endDate, type, source, paymentMode, status, patientId, createdBy);
        return Map.of("success", true, "data", data);
    }

    @PostMapping("/transactions")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody LedgerService.CreateTransactionRequest req,
                                      @AuthenticationPrincipal AuthUser user) {
        return service.create(req, user.id());
    }

    @PutMapping("/transactions/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @AuthenticationPrincipal AuthUser user,
                                      @RequestBody LedgerService.UpdateTransactionRequest req) {
        return service.update(id, user, req);
    }

    @DeleteMapping("/transactions/{id}")
    public Map<String, Object> delete(@PathVariable UUID id, @AuthenticationPrincipal AuthUser user) {
        return service.delete(id, user);
    }

    @PutMapping("/transactions/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
    public Map<String, Object> updateStatus(@PathVariable UUID id, @RequestBody StatusRequest req,
                                            @AuthenticationPrincipal AuthUser user) {
        return service.updateStatus(id, req.status(), user.id());
    }

    @GetMapping("/daily-summary/{date}")
    public Map<String, Object> dailySummary(@PathVariable LocalDate date, @AuthenticationPrincipal AuthUser user) {
        return service.dailySummary(date, user.id());
    }

    @PostMapping("/close-day")
    @PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
    public Map<String, Object> closeDay(@RequestBody CloseDayRequest req, @AuthenticationPrincipal AuthUser user) {
        return service.closeDay(req.closureDate(), req.openingBalance(), req.notes(), user.id());
    }

    @PostMapping("/close-employee-day")
    @PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
    public Map<String, Object> closeEmployeeDay(@RequestBody CloseEmployeeDayRequest req) {
        return service.closeEmployeeDay(req.employeeId(), req.settlementDate(), req.notes());
    }

    @GetMapping("/employee-shift-summary")
    @PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
    public Map<String, Object> employeeShiftSummary(@RequestParam(required = false) LocalDate date) {
        return service.employeeShiftSummary(date);
    }

    public record StatusRequest(String status) {}
    public record CloseDayRequest(LocalDate closureDate, BigDecimal openingBalance, String notes) {}
    public record CloseEmployeeDayRequest(UUID employeeId, LocalDate settlementDate, String notes) {}
}
