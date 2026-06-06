package tech.pritamrao.kkrhms.controller;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/test-results")
public class TestResultController {

    private final TestResultService service;

    public TestResultController(TestResultService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "50") int pageSize,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(name = "test_id", required = false) UUID testId,
                                    @RequestParam(name = "patient_id", required = false) UUID patientId,
                                    @RequestParam(name = "from_date", required = false) LocalDate fromDate,
                                    @RequestParam(name = "to_date", required = false) LocalDate toDate) {
        return service.list(status, testId, patientId, fromDate, toDate, page, pageSize);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody TestResultService.CreateResultRequest req) {
        return service.create(req);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody TestResultService.UpdateResultRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable UUID id) {
        return service.delete(id);
    }

    @GetMapping("/{id}/values")
    public Map<String, Object> listValues(@PathVariable UUID id) {
        return service.listValues(id);
    }

    @PostMapping("/{id}/values")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> saveValues(@PathVariable UUID id, @RequestBody ValuesRequest req) {
        return service.saveValues(id, req.values());
    }

    @PutMapping("/{id}/values/{valueId}")
    public Map<String, Object> updateValue(@PathVariable UUID id, @PathVariable UUID valueId,
                                           @RequestBody TestResultService.ValueInput req) {
        return service.updateValue(id, valueId, req);
    }

    @DeleteMapping("/{id}/values/{valueId}")
    public Map<String, Object> deleteValue(@PathVariable UUID id, @PathVariable UUID valueId) {
        return service.deleteValue(id, valueId);
    }

    public record ValuesRequest(List<TestResultService.ValueInput> values) {}
}
