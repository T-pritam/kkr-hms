package tech.pritamrao.kkrhms.patients;

import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tech.pritamrao.kkrhms.security.AuthUser;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/patients")
public class PatientController {

    private final PatientService service;

    public PatientController(PatientService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "10") int pageSize,
                                    @RequestParam(defaultValue = "") String search) {
        Page<Patient> result = service.list(page, pageSize, search);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("patients", result.getContent().stream().map(PatientDtos.PatientView::of).toList());
        body.put("total", result.getTotalElements());
        body.put("page", page);
        body.put("pageSize", pageSize);
        body.put("totalPages", result.getTotalPages());
        return body;
    }

    @GetMapping("/active")
    public List<PatientDtos.PatientOption> active() {
        return service.activePatients();
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable UUID id) {
        return Map.of("patient", PatientDtos.PatientView.of(service.get(id)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody PatientDtos.PatientRequest req,
                                      @AuthenticationPrincipal AuthUser user) {
        service.create(req, user.id());
        return Map.of("message", "Patient created successfully");
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody PatientDtos.PatientRequest req) {
        service.update(id, req);
        return Map.of("message", "Patient updated successfully");
    }

    @PatchMapping("/{id}")
    public Map<String, Object> patch(@PathVariable UUID id, @RequestBody PatientDtos.PatientPatchRequest req) {
        service.patch(id, req);
        return Map.of("message", "Patient updated successfully");
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable UUID id) {
        service.delete(id);
        return Map.of("message", "Patient deleted successfully");
    }
}
