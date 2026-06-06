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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/employees")
@PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
public class EmployeeController {

    private final EmployeeRepository employeeRepository;
    private final SalaryPaymentRepository salaryRepository;

    public EmployeeController(EmployeeRepository employeeRepository, SalaryPaymentRepository salaryRepository) {
        this.employeeRepository = employeeRepository;
        this.salaryRepository = salaryRepository;
    }

    public record EmployeeRequest(String name, String designation, BigDecimal baseSalary, LocalDate joinDate, String status) {}

    @GetMapping
    public Map<String, Object> list(@RequestParam(defaultValue = "Active") String status,
                                    @RequestParam(name = "month_year", required = false) String monthYear) {
        List<Employee> employees = employeeRepository.findByStatusOrderByNameAsc(status);
        if (monthYear != null) {
            List<UUID> ids = employees.stream().map(Employee::getId).toList();
            var salaries = salaryRepository.findByMonthYear(monthYear).stream()
                    .filter(s -> ids.contains(s.getEmployeeId()))
                    .collect(java.util.stream.Collectors.toMap(SalaryPayment::getEmployeeId, s -> s, (a, b) -> a));
            List<Map<String, Object>> enriched = employees.stream().map(e -> {
                Map<String, Object> m = view(e);
                SalaryPayment sr = salaries.get(e.getId());
                m.put("salary_record", sr);
                m.put("has_salary_record", sr != null);
                return m;
            }).toList();
            return Map.of("success", true, "data", enriched);
        }
        return Map.of("success", true, "data", employees.stream().map(this::view).toList());
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable UUID id) {
        return Map.of("success", true, "data", view(require(id)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String, Object> create(@RequestBody EmployeeRequest req) {
        if (req.name() == null || req.name().length() < 2 || req.name().length() > 100) {
            throw ApiException.badRequest("Name must be between 2 and 100 characters");
        }
        if (req.designation() == null || req.designation().length() > 50) {
            throw ApiException.badRequest("Designation is required and must be max 50 characters");
        }
        if (req.baseSalary() == null || req.baseSalary().signum() <= 0) {
            throw ApiException.badRequest("Base salary must be greater than 0");
        }
        Employee e = new Employee();
        e.setName(req.name());
        e.setDesignation(req.designation());
        e.setBaseSalary(req.baseSalary());
        e.setJoinDate(req.joinDate() != null ? req.joinDate() : LocalDate.now());
        e.setStatus(req.status() != null ? req.status() : "Active");
        Employee saved = employeeRepository.save(e);
        return Map.of("success", true, "message", "Employee created successfully", "data", view(saved));
    }

    @PutMapping("/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody EmployeeRequest req) {
        Employee e = require(id);
        if (req.name() != null) {
            if (req.name().length() < 2 || req.name().length() > 100) {
                throw ApiException.badRequest("Name must be between 2 and 100 characters");
            }
            e.setName(req.name());
        }
        if (req.designation() != null) {
            if (req.designation().length() > 50) throw ApiException.badRequest("Designation must be max 50 characters");
            e.setDesignation(req.designation());
        }
        if (req.baseSalary() != null) {
            if (req.baseSalary().signum() <= 0) throw ApiException.badRequest("Base salary must be greater than 0");
            e.setBaseSalary(req.baseSalary());
        }
        if (req.joinDate() != null) e.setJoinDate(req.joinDate());
        if (req.status() != null) {
            if (!List.of("Active", "Inactive").contains(req.status())) {
                throw ApiException.badRequest("Status must be Active or Inactive");
            }
            e.setStatus(req.status());
        }
        return Map.of("success", true, "message", "Employee updated successfully", "data", view(employeeRepository.save(e)));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public Map<String, Object> delete(@PathVariable UUID id) {
        Employee e = require(id);
        e.setStatus("Inactive");
        return Map.of("success", true, "message", "Employee marked as Inactive successfully", "data", view(employeeRepository.save(e)));
    }

    @PostMapping("/import")
    @Transactional
    public Map<String, Object> importCsv(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("No file provided");
        if (file.getOriginalFilename() == null || !file.getOriginalFilename().endsWith(".csv")) {
            throw ApiException.badRequest("File must be a CSV");
        }
        List<String> lines = readLines(file);
        if (lines.size() < 2) throw ApiException.badRequest("CSV file is empty or has no data rows");

        String[] header = lines.get(0).split(",");
        int nameIdx = indexOf(header, "name");
        int salaryIdx = indexOf(header, "salary");
        int roleIdx = indexOf(header, "role");
        if (nameIdx == -1 || salaryIdx == -1) throw ApiException.badRequest("CSV must contain Name and Salary columns");

        List<Employee> employees = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        for (int i = 1; i < lines.size(); i++) {
            String[] cols = lines.get(i).split(",");
            String name = cols.length > nameIdx ? cols[nameIdx].trim() : "";
            String designation = roleIdx != -1 && cols.length > roleIdx ? cols[roleIdx].trim() : "Nurse";
            if (name.isEmpty()) { errors.add("Row " + (i + 1) + ": Name is required"); continue; }
            BigDecimal salary;
            try {
                salary = new BigDecimal(cols[salaryIdx].trim());
            } catch (Exception ex) {
                errors.add("Row " + (i + 1) + ": Invalid salary (minimum 1000)"); continue;
            }
            if (salary.compareTo(BigDecimal.valueOf(1000)) < 0) {
                errors.add("Row " + (i + 1) + ": Invalid salary (minimum 1000)"); continue;
            }
            Employee e = new Employee();
            e.setName(name);
            e.setDesignation(designation);
            e.setBaseSalary(salary);
            e.setJoinDate(LocalDate.now());
            e.setStatus("Active");
            employees.add(e);
        }
        if (employees.isEmpty()) throw ApiException.badRequest("No valid employee data found");
        employeeRepository.saveAll(employees);
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("message", "Successfully imported " + employees.size() + " employees");
        body.put("imported", employees.size());
        if (!errors.isEmpty()) body.put("errors", errors);
        return body;
    }

    private List<String> readLines(MultipartFile file) {
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isBlank()) lines.add(line);
            }
        } catch (IOException e) {
            throw ApiException.badRequest("Failed to read CSV");
        }
        return lines;
    }

    private int indexOf(String[] header, String name) {
        for (int i = 0; i < header.length; i++) {
            if (header[i].trim().equalsIgnoreCase(name)) return i;
        }
        return -1;
    }

    private Employee require(UUID id) {
        return employeeRepository.findById(id).orElseThrow(() -> ApiException.notFound("Employee not found"));
    }

    private Map<String, Object> view(Employee e) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", e.getId());
        m.put("name", e.getName());
        m.put("designation", e.getDesignation());
        m.put("base_salary", e.getBaseSalary());
        m.put("join_date", e.getJoinDate());
        m.put("status", e.getStatus());
        m.put("created_at", e.getCreatedAt());
        m.put("updated_at", e.getUpdatedAt());
        return m;
    }
}
