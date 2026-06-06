package tech.pritamrao.kkrhms.employees;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/employees/salary")
@PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
public class SalaryController {

    private final SalaryService service;

    public SalaryController(SalaryService service) {
        this.service = service;
    }

    public record PatchSalaryRequest(Integer daysPresent, Integer otDays, BigDecimal baseSalary) {}
    public record SettleRequest(UUID employeeId, String monthYear) {}
    public record SettleAllRequest(String monthYear) {}
    public record MonthlyRequest(String monthYear, List<SalaryService.MonthlyEntry> employeesData) {}

    @GetMapping
    public Map<String, Object> list(@RequestParam(name = "month_year") String monthYear) {
        return service.monthlySummary(monthYear);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        return service.get(id);
    }

    @PatchMapping("/{id}")
    public Map<String, Object> patch(@PathVariable Long id, @RequestBody PatchSalaryRequest req) {
        return service.patch(id, req.daysPresent(), req.otDays(), req.baseSalary());
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id) {
        return service.delete(id);
    }

    @PostMapping("/settle")
    public Map<String, Object> settle(@RequestBody SettleRequest req) {
        return service.settle(req.employeeId(), req.monthYear());
    }

    @PostMapping("/settle-all")
    public Map<String, Object> settleAll(@RequestBody SettleAllRequest req) {
        return service.settleAll(req.monthYear());
    }

    @PostMapping("/monthly")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> monthly(@RequestBody MonthlyRequest req) {
        return service.monthlyUpsert(req.monthYear(), req.employeesData());
    }
}
