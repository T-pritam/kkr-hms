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
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class SalaryService {

    private static final Pattern MONTH = Pattern.compile("^\\d{4}-\\d{2}$");

    private final EmployeeRepository employeeRepository;
    private final SalaryPaymentRepository salaryRepository;
    private final AdvanceRepository advanceRepository;

    public SalaryService(EmployeeRepository employeeRepository, SalaryPaymentRepository salaryRepository,
                         AdvanceRepository advanceRepository) {
        this.employeeRepository = employeeRepository;
        this.salaryRepository = salaryRepository;
        this.advanceRepository = advanceRepository;
    }

    public Map<String, Object> monthlySummary(String monthYear) {
        requireMonth(monthYear);
        List<Employee> active = employeeRepository.findByStatusOrderByNameAsc("Active");
        List<SalaryPayment> salaryRecords = salaryRepository.findByMonthYear(monthYear);

        List<UUID> recordEmployeeIds = salaryRecords.stream().map(SalaryPayment::getEmployeeId).toList();
        List<Employee> inactive = recordEmployeeIds.isEmpty() ? List.of()
                : employeeRepository.findByIdInAndStatusOrderByNameAsc(recordEmployeeIds, "Inactive");

        List<Employee> all = new ArrayList<>(active);
        all.addAll(inactive);

        Map<UUID, SalaryPayment> salaryByEmployee = salaryRecords.stream()
                .collect(Collectors.toMap(SalaryPayment::getEmployeeId, s -> s, (a, b) -> a));
        List<Advance> advances = advanceRepository.findByMonthYearOrderByDateGivenDesc(monthYear);
        Map<UUID, List<Advance>> advancesByEmployee = advances.stream()
                .collect(Collectors.groupingBy(Advance::getEmployeeId));

        List<Map<String, Object>> employeesWithSalary = all.stream().map(emp -> {
            SalaryPayment sr = salaryByEmployee.get(emp.getId());
            List<Advance> empAdvances = advancesByEmployee.getOrDefault(emp.getId(), List.of());
            BigDecimal totalAdvance = empAdvances.stream().map(Advance::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal baseSalary = sr != null && sr.getBaseSalary() != null ? sr.getBaseSalary() : emp.getBaseSalary();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", emp.getId());
            m.put("name", emp.getName());
            m.put("designation", emp.getDesignation());
            m.put("base_salary", baseSalary);
            m.put("join_date", emp.getJoinDate());
            m.put("status", emp.getStatus());
            m.put("salary_record", sr);
            m.put("advances", empAdvances);
            m.put("advance_count", empAdvances.size());
            m.put("total_advance", totalAdvance);
            return m;
        }).toList();

        BigDecimal totalAdvancesPaid = advances.stream().map(Advance::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal needToSettle = sumFinal(salaryRecords, "pending");
        BigDecimal settledAmount = sumFinal(salaryRecords, "settled");
        long pendingCount = salaryRecords.stream().filter(s -> "pending".equals(s.getStatus())).count();
        long settledCount = salaryRecords.stream().filter(s -> "settled".equals(s.getStatus())).count();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total_advances_paid", totalAdvancesPaid);
        summary.put("need_to_settle", needToSettle);
        summary.put("settled_amount", settledAmount);
        summary.put("grand_total", totalAdvancesPaid.add(needToSettle).add(settledAmount));
        summary.put("pending_count", pendingCount);
        summary.put("settled_count", settledCount);
        summary.put("total_employees", active.size());
        summary.put("employees_with_records", salaryRecords.size());

        return Map.of("success", true, "data", employeesWithSalary, "summary", summary);
    }

    public Map<String, Object> get(Long id) {
        SalaryPayment sr = salaryRepository.findById(id).orElseThrow(() -> ApiException.notFound("Salary record not found"));
        Employee employee = employeeRepository.findById(sr.getEmployeeId()).orElse(null);
        List<Advance> advances = advanceRepository
                .findByEmployeeIdAndMonthYearOrderByDateGivenDesc(sr.getEmployeeId(), sr.getMonthYear());
        Map<String, Object> data = new LinkedHashMap<>(salaryMap(sr));
        data.put("employee", employee);
        data.put("advances", advances);
        return Map.of("success", true, "data", data);
    }

    @Transactional
    public Map<String, Object> patch(Long id, Integer daysPresent, Integer otDays, BigDecimal baseSalary) {
        SalaryPayment sr = salaryRepository.findById(id).orElseThrow(() -> ApiException.notFound("Salary record not found"));
        if ("settled".equals(sr.getStatus())) throw ApiException.badRequest("Cannot update settled salary records");

        if (daysPresent != null) {
            if (daysPresent < 0 || daysPresent > 27) throw ApiException.badRequest("days_present must be between 0 and 27");
            sr.setDaysPresent(daysPresent);
        }
        if (otDays != null) {
            if (otDays < 0 || otDays > 3) throw ApiException.badRequest("ot_days must be between 0 and 3");
            if (otDays > 0 && sr.getDaysPresent() != 27) {
                throw ApiException.badRequest("ot_days can only be set when days_present is 27");
            }
            sr.setOtDays(otDays);
        }
        if (baseSalary != null) {
            if (baseSalary.signum() <= 0) throw ApiException.badRequest("base_salary must be greater than 0");
            sr.setBaseSalary(baseSalary);
        }

        BigDecimal totalAdvance = advanceRepository
                .findByEmployeeIdAndMonthYearOrderByDateGivenDesc(sr.getEmployeeId(), sr.getMonthYear())
                .stream().map(Advance::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        SalaryCalculator.Result calc = SalaryCalculator.compute(sr.getBaseSalary(), sr.getDaysPresent(), sr.getOtDays(), totalAdvance);
        sr.setOtDays(calc.validOtDays());
        sr.setCalculatedSalary(calc.calculatedSalary());
        sr.setFinalSalary(calc.finalSalary());
        sr.setTotalAdvance(totalAdvance);
        return Map.of("success", true, "message", "Salary record updated successfully", "data", salaryMap(salaryRepository.save(sr)));
    }

    @Transactional
    public Map<String, Object> delete(Long id) {
        SalaryPayment sr = salaryRepository.findById(id).orElseThrow(() -> ApiException.notFound("Salary record not found"));
        if ("settled".equals(sr.getStatus())) throw ApiException.badRequest("Cannot delete settled salary records");
        salaryRepository.delete(sr);
        return Map.of("success", true, "message", "Salary record deleted successfully");
    }

    @Transactional
    public Map<String, Object> settle(UUID employeeId, String monthYear) {
        if (employeeId == null) throw ApiException.badRequest("employee_id is required");
        requireMonth(monthYear);
        SalaryPayment sr = salaryRepository.findByEmployeeIdAndMonthYear(employeeId, monthYear)
                .orElseThrow(() -> ApiException.notFound("Salary record not found"));
        if ("settled".equals(sr.getStatus())) throw ApiException.badRequest("Salary already settled");
        sr.setStatus("settled");
        sr.setSettledOn(LocalDate.now());
        return Map.of("success", true, "message", "Salary settled successfully", "data", salaryMap(salaryRepository.save(sr)));
    }

    @Transactional
    public Map<String, Object> settleAll(String monthYear) {
        requireMonth(monthYear);
        List<UUID> activeIds = employeeRepository.findByStatusOrderByNameAsc("Active").stream().map(Employee::getId).toList();
        Set<UUID> recordedIds = salaryRepository.findByMonthYear(monthYear).stream()
                .map(SalaryPayment::getEmployeeId).collect(Collectors.toSet());
        List<UUID> missing = activeIds.stream().filter(id -> !recordedIds.contains(id)).toList();
        if (!missing.isEmpty()) {
            throw ApiException.badRequest("Cannot settle all: " + missing.size() + " active employees are missing salary records");
        }
        List<SalaryPayment> pending = salaryRepository.findByMonthYearAndStatus(monthYear, "pending");
        pending.forEach(s -> { s.setStatus("settled"); s.setSettledOn(LocalDate.now()); });
        salaryRepository.saveAll(pending);
        return Map.of("success", true,
                "message", "Successfully settled " + pending.size() + " salary records for " + monthYear,
                "settled_count", pending.size(),
                "data", pending.stream().map(this::salaryMap).toList());
    }

    @Transactional
    public Map<String, Object> monthlyUpsert(String monthYear, List<MonthlyEntry> entries) {
        requireMonth(monthYear);
        if (entries == null || entries.isEmpty()) throw ApiException.badRequest("employees_data must be a non-empty array");

        List<UUID> employeeIds = entries.stream().map(MonthlyEntry::employeeId).toList();
        Set<UUID> settledIds = salaryRepository.findByEmployeeIdInAndMonthYearAndStatus(employeeIds, monthYear, "settled")
                .stream().map(SalaryPayment::getEmployeeId).collect(Collectors.toSet());

        List<MonthlyEntry> toProcess = entries.stream().filter(e -> !settledIds.contains(e.employeeId())).toList();
        if (toProcess.isEmpty()) throw ApiException.badRequest("All employees already have settled records for this month");

        Map<UUID, BigDecimal> advancesByEmployee = advanceRepository.findByEmployeeIdInAndMonthYear(employeeIds, monthYear)
                .stream().collect(Collectors.groupingBy(Advance::getEmployeeId,
                        Collectors.reducing(BigDecimal.ZERO, Advance::getAmount, BigDecimal::add)));

        List<SalaryPayment> saved = new ArrayList<>();
        for (MonthlyEntry e : toProcess) {
            if (e.daysPresent() < 0 || e.daysPresent() > 27) throw ApiException.badRequest("Invalid days_present for employee " + e.employeeId() + ": must be 0-27");
            int ot = e.otDays() != null ? e.otDays() : 0;
            if (ot < 0 || ot > 3) throw ApiException.badRequest("Invalid ot_days for employee " + e.employeeId() + ": must be 0-3");
            BigDecimal totalAdvance = advancesByEmployee.getOrDefault(e.employeeId(), BigDecimal.ZERO);
            SalaryCalculator.Result calc = SalaryCalculator.compute(e.baseSalary(), e.daysPresent(), ot, totalAdvance);

            SalaryPayment sr = salaryRepository.findByEmployeeIdAndMonthYear(e.employeeId(), monthYear)
                    .orElseGet(SalaryPayment::new);
            sr.setEmployeeId(e.employeeId());
            sr.setMonthYear(monthYear);
            sr.setBaseSalary(e.baseSalary());
            sr.setTotalWorkingDays(27);
            sr.setDaysPresent(e.daysPresent());
            sr.setOtDays(calc.validOtDays());
            sr.setTotalAdvance(totalAdvance);
            sr.setCalculatedSalary(calc.calculatedSalary());
            sr.setFinalSalary(calc.finalSalary());
            sr.setStatus("pending");
            saved.add(salaryRepository.save(sr));
        }
        return Map.of("success", true,
                "message", "Successfully created/updated " + saved.size() + " salary records for " + monthYear,
                "data", saved.stream().map(this::salaryMap).toList(),
                "skipped_settled", settledIds.size());
    }

    // ── advances ──────────────────────────────────────────────────────────
    public Map<String, Object> advancesForMonth(String monthYear) {
        if (monthYear == null) throw ApiException.badRequest("month_year parameter is required");
        List<Advance> advances = advanceRepository.findByMonthYearOrderByDateGivenDesc(monthYear);
        Map<UUID, Employee> employees = employeeRepository.findAllById(
                advances.stream().map(Advance::getEmployeeId).distinct().toList())
                .stream().collect(Collectors.toMap(Employee::getId, e -> e));
        List<Map<String, Object>> data = advances.stream().map(a -> {
            Map<String, Object> m = new LinkedHashMap<>(advanceMap(a));
            Employee e = employees.get(a.getEmployeeId());
            m.put("employee", e == null ? null : Map.of("id", e.getId(), "name", e.getName(), "designation", e.getDesignation()));
            return m;
        }).toList();
        BigDecimal total = advances.stream().map(Advance::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        long employeeCount = advances.stream().map(Advance::getEmployeeId).distinct().count();
        return Map.of("success", true, "data", data,
                "summary", Map.of("total_amount", total, "advance_count", advances.size(), "employee_count", employeeCount));
    }

    @Transactional
    public Map<String, Object> createAdvance(UUID employeeId, BigDecimal amount, LocalDate dateGiven, String monthYear, String remarks) {
        if (employeeId == null) throw ApiException.badRequest("employee_id is required");
        if (amount == null || amount.signum() <= 0) throw ApiException.badRequest("amount must be greater than 0");
        if (dateGiven == null) throw ApiException.badRequest("date_given is required");
        requireMonth(monthYear);
        Employee employee = employeeRepository.findById(employeeId).orElseThrow(() -> ApiException.notFound("Employee not found"));

        Advance advance = save(employeeId, amount, dateGiven, monthYear, remarks);
        syncSalaryAdvance(employeeId, monthYear);

        Map<String, Object> m = new LinkedHashMap<>(advanceMap(advance));
        m.put("employee_name", employee.getName());
        return Map.of("success", true, "message", "Advance payment recorded successfully", "data", m);
    }

    @Transactional
    public Map<String, Object> createValidatedAdvance(UUID employeeId, BigDecimal amount, LocalDate dateGiven,
                                                      String monthYear, String remarks) {
        if (amount == null || dateGiven == null || monthYear == null) {
            throw ApiException.badRequest("Amount, date, and month_year are required");
        }
        Employee employee = employeeRepository.findById(employeeId).orElseThrow(() -> ApiException.notFound("Employee not found"));
        SalaryPayment sr = salaryRepository.findByEmployeeIdAndMonthYear(employeeId, monthYear).orElse(null);
        if (sr != null && "settled".equals(sr.getStatus())) {
            throw ApiException.badRequest("Salary is already settled. No further advances can be added.");
        }
        AdvanceValidation validation = validate(employee, sr, monthYear);
        if (!validation.allowed()) throw ApiException.badRequest(validation.reason());
        if (amount.signum() <= 0) throw ApiException.badRequest("Advance amount must be greater than 0");
        if (amount.compareTo(validation.maxAllowed()) > 0) {
            throw ApiException.badRequest("Advance amount cannot exceed " + validation.maxAllowed());
        }
        Advance advance = save(employeeId, amount, dateGiven, monthYear, remarks);
        syncSalaryAdvance(employeeId, monthYear);
        return Map.of("success", true, "message", "Advance recorded successfully", "data", advanceMap(advance));
    }

    public Map<String, Object> validationInfo(UUID employeeId, String monthYear) {
        requireMonth(monthYear);
        Employee employee = employeeRepository.findById(employeeId).orElseThrow(() -> ApiException.notFound("Employee not found"));
        SalaryPayment sr = salaryRepository.findByEmployeeIdAndMonthYear(employeeId, monthYear).orElse(null);
        AdvanceValidation v = validate(employee, sr, monthYear);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("is_allowed", v.allowed());
        data.put("max_allowed_advance", v.maxAllowed());
        data.put("current_advance_total", v.currentTotal());
        data.put("base_salary", employee.getBaseSalary());
        data.put("calculated_salary", sr != null ? sr.getCalculatedSalary() : BigDecimal.ZERO);
        data.put("remaining_amount", v.maxAllowed());
        data.put("reason", v.reason());
        return Map.of("success", true, "data", data);
    }

    /** Port of lib/salary-advance-validation.ts. */
    private AdvanceValidation validate(Employee employee, SalaryPayment sr, String monthYear) {
        BigDecimal baseSalary = sr != null && sr.getBaseSalary() != null ? sr.getBaseSalary()
                : (employee.getBaseSalary() != null ? employee.getBaseSalary() : BigDecimal.ZERO);
        BigDecimal currentTotal = advanceRepository
                .findByEmployeeIdAndMonthYearOrderByDateGivenDesc(employee.getId(), monthYear)
                .stream().map(Advance::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        if (sr == null) {
            BigDecimal max = baseSalary.subtract(currentTotal);
            boolean allowed = max.signum() > 0;
            return new AdvanceValidation(allowed, max.max(BigDecimal.ZERO), currentTotal,
                    allowed ? null : "Maximum advance limit (base salary) has been reached");
        }
        if ("settled".equals(sr.getStatus())) {
            return new AdvanceValidation(false, BigDecimal.ZERO, currentTotal,
                    "Salary is already settled. No further advances can be added.");
        }
        BigDecimal calculated = sr.getCalculatedSalary() != null ? sr.getCalculatedSalary() : BigDecimal.ZERO;
        if (calculated.signum() <= 0) {
            return new AdvanceValidation(false, BigDecimal.ZERO, currentTotal, "No calculated salary available for advances");
        }
        BigDecimal totalAdvances = sr.getTotalAdvance() != null ? sr.getTotalAdvance() : BigDecimal.ZERO;
        BigDecimal remaining = calculated.subtract(totalAdvances);
        boolean allowed = remaining.signum() > 0;
        return new AdvanceValidation(allowed, remaining.max(BigDecimal.ZERO), totalAdvances,
                allowed ? null : "Full calculated salary has been claimed through advances");
    }

    private Advance save(UUID employeeId, BigDecimal amount, LocalDate dateGiven, String monthYear, String remarks) {
        Advance advance = new Advance();
        advance.setEmployeeId(employeeId);
        advance.setAmount(amount);
        advance.setDateGiven(dateGiven);
        advance.setMonthYear(monthYear);
        advance.setRemarks(remarks);
        return advanceRepository.save(advance);
    }

    private void syncSalaryAdvance(UUID employeeId, String monthYear) {
        salaryRepository.findByEmployeeIdAndMonthYear(employeeId, monthYear).ifPresent(sr -> {
            BigDecimal total = advanceRepository.findByEmployeeIdAndMonthYearOrderByDateGivenDesc(employeeId, monthYear)
                    .stream().map(Advance::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal calculated = sr.getCalculatedSalary() != null ? sr.getCalculatedSalary() : BigDecimal.ZERO;
            sr.setTotalAdvance(total);
            sr.setFinalSalary(calculated.subtract(total));
            salaryRepository.save(sr);
        });
    }

    private BigDecimal sumFinal(List<SalaryPayment> records, String status) {
        return records.stream().filter(s -> status.equals(s.getStatus()))
                .map(s -> s.getFinalSalary() != null ? s.getFinalSalary() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private void requireMonth(String monthYear) {
        if (monthYear == null || !MONTH.matcher(monthYear).matches()) {
            throw ApiException.badRequest("Invalid month_year format. Must be YYYY-MM");
        }
    }

    private Map<String, Object> salaryMap(SalaryPayment s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("employee_id", s.getEmployeeId());
        m.put("month_year", s.getMonthYear());
        m.put("base_salary", s.getBaseSalary());
        m.put("total_working_days", s.getTotalWorkingDays());
        m.put("days_present", s.getDaysPresent());
        m.put("ot_days", s.getOtDays());
        m.put("total_advance", s.getTotalAdvance());
        m.put("calculated_salary", s.getCalculatedSalary());
        m.put("final_salary", s.getFinalSalary());
        m.put("status", s.getStatus());
        m.put("settled_on", s.getSettledOn());
        m.put("created_at", s.getCreatedAt());
        m.put("updated_at", s.getUpdatedAt());
        return m;
    }

    private Map<String, Object> advanceMap(Advance a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("employee_id", a.getEmployeeId());
        m.put("amount", a.getAmount());
        m.put("date_given", a.getDateGiven());
        m.put("month_year", a.getMonthYear());
        m.put("remarks", a.getRemarks());
        m.put("created_at", a.getCreatedAt());
        return m;
    }

    public record MonthlyEntry(UUID employeeId, BigDecimal baseSalary, Integer daysPresent, Integer otDays) {}

    private record AdvanceValidation(boolean allowed, BigDecimal maxAllowed, BigDecimal currentTotal, String reason) {}
}
