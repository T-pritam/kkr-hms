package tech.pritamrao.kkrhms.controller;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/test-parameters")
public class TestParameterController {

    private final TestParameterRepository repository;

    public TestParameterController(TestParameterRepository repository) {
        this.repository = repository;
    }

    @PutMapping("/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody LabDtos.ParameterRequest req) {
        TestParameter p = repository.findById(id).orElseThrow(() -> ApiException.notFound("Test parameter not found"));
        if (req.name() != null) p.setName(req.name());
        if (req.unit() != null) p.setUnit(req.unit());
        if (req.minValue() != null) p.setMinValue(req.minValue());
        if (req.maxValue() != null) p.setMaxValue(req.maxValue());
        if (req.genderSpecific() != null) p.setGenderSpecific(req.genderSpecific());
        if (req.maleMin() != null) p.setMaleMin(req.maleMin());
        if (req.maleMax() != null) p.setMaleMax(req.maleMax());
        if (req.femaleMin() != null) p.setFemaleMin(req.femaleMin());
        if (req.femaleMax() != null) p.setFemaleMax(req.femaleMax());
        if (req.displayOrder() != null) p.setDisplayOrder(req.displayOrder());
        if (req.isActive() != null) p.setIsActive(req.isActive());
        TestParameter saved = repository.save(p);
        return Map.of("success", true, "message", "Test parameter updated successfully", "data", LabDtos.ParameterView.of(saved));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public Map<String, Object> delete(@PathVariable UUID id) {
        repository.deleteById(id);
        return Map.of("success", true, "message", "Test parameter deleted successfully");
    }
}
