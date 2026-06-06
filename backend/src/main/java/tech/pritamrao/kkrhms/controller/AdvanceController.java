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
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/employees")
@PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
public class AdvanceController {

    private final SalaryService service;

    public AdvanceController(SalaryService service) {
        this.service = service;
    }

    public record AdvanceRequest(UUID employeeId, BigDecimal amount, LocalDate dateGiven, String monthYear, String remarks) {}

    @GetMapping("/advances")
    public Map<String, Object> list(@RequestParam(name = "month_year") String monthYear) {
        return service.advancesForMonth(monthYear);
    }

    @PostMapping("/advances")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody AdvanceRequest req) {
        return service.createAdvance(req.employeeId(), req.amount(), req.dateGiven(), req.monthYear(), req.remarks());
    }

    @PostMapping("/{id}/salary/advances")
    public Map<String, Object> createForEmployee(@PathVariable UUID id, @RequestBody AdvanceRequest req) {
        return service.createValidatedAdvance(id, req.amount(), req.dateGiven(), req.monthYear(), req.remarks());
    }

    @GetMapping("/{id}/salary/advances/validation")
    public Map<String, Object> validation(@PathVariable UUID id, @RequestParam(name = "month_year") String monthYear) {
        return service.validationInfo(id, monthYear);
    }
}
