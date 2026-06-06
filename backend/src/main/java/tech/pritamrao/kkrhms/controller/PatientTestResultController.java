package tech.pritamrao.kkrhms.controller;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.web.bind.annotation.*;

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
