package tech.pritamrao.kkrhms.lab;

import org.springframework.web.bind.annotation.*;
import tech.pritamrao.kkrhms.common.ApiException;
import tech.pritamrao.kkrhms.patients.Patient;
import tech.pritamrao.kkrhms.patients.PatientRepository;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/patients/{patientId}/test-results")
public class PatientTestResultController {

    private final TestResultService service;
    private final PatientRepository patientRepository;

    public PatientTestResultController(TestResultService service, PatientRepository patientRepository) {
        this.service = service;
        this.patientRepository = patientRepository;
    }

    @GetMapping
    public Map<String, Object> list(@PathVariable UUID patientId,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "50") int pageSize) {
        Patient patient = patientRepository.findById(patientId)
                .orElseThrow(() -> ApiException.notFound("Patient not found"));
        Map<String, Object> result = service.patientResults(patientId, page, pageSize);
        @SuppressWarnings("unchecked")
        Map<String, Object> data = new LinkedHashMap<>((Map<String, Object>) result.get("data"));
        data.put("patient", Map.of("id", patient.getId(), "name", patient.getName()));
        return Map.of("success", true, "data", data);
    }
}
