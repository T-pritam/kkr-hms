package tech.pritamrao.kkrhms.controller;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/lab-tests")
public class LabTestController {

    private final LabTestRepository testRepository;
    private final TestParameterRepository parameterRepository;

    public LabTestController(LabTestRepository testRepository, TestParameterRepository parameterRepository) {
        this.testRepository = testRepository;
        this.parameterRepository = parameterRepository;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "50") int pageSize,
                                    @RequestParam(required = false) String category,
                                    @RequestParam(name = "is_active", required = false) Boolean isActive,
                                    @RequestParam(required = false) String name) {
        int size = Math.min(pageSize, 100);
        Page<LabTest> result = testRepository.search(category, isActive, name,
                PageRequest.of(Math.max(page - 1, 0), size));
        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("page", page);
        pagination.put("pageSize", size);
        pagination.put("total", result.getTotalElements());
        pagination.put("totalPages", result.getTotalPages());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("data", result.getContent().stream().map(LabDtos.LabTestView::of).toList());
        data.put("pagination", pagination);
        return Map.of("success", true, "data", data);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable UUID id) {
        LabTest test = require(id);
        return Map.of("success", true, "data", LabDtos.LabTestView.of(test));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String, Object> create(@RequestBody LabDtos.LabTestRequest req) {
        if (isBlank(req.name()) || isBlank(req.code()) || req.price() == null) {
            throw ApiException.badRequest("Name, code, and price are required");
        }
        if (testRepository.existsByCode(req.code())) {
            throw ApiException.badRequest("Test code already exists");
        }
        LabTest test = new LabTest();
        test.setName(req.name());
        test.setCode(req.code());
        test.setCategory(req.category());
        test.setDescription(req.description());
        test.setSampleType(req.sampleType());
        test.setPrice(req.price());
        test.setIsActive(req.isActive() != null ? req.isActive() : true);
        LabTest saved = testRepository.save(test);
        return Map.of("success", true, "message", "Lab test created successfully", "data", LabDtos.LabTestView.of(saved));
    }

    @PutMapping("/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody LabDtos.LabTestRequest req) {
        LabTest test = require(id);
        if (req.code() != null && testRepository.existsByCodeAndIdNot(req.code(), id)) {
            throw ApiException.badRequest("Test code already exists");
        }
        if (req.name() != null) test.setName(req.name());
        if (req.code() != null) test.setCode(req.code());
        if (req.category() != null) test.setCategory(req.category());
        if (req.description() != null) test.setDescription(req.description());
        if (req.sampleType() != null) test.setSampleType(req.sampleType());
        if (req.price() != null) test.setPrice(req.price());
        if (req.isActive() != null) test.setIsActive(req.isActive());
        LabTest saved = testRepository.save(test);
        return Map.of("success", true, "message", "Lab test updated successfully", "data", LabDtos.LabTestView.of(saved));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public Map<String, Object> delete(@PathVariable UUID id) {
        testRepository.deleteById(id);
        return Map.of("success", true, "message", "Lab test deleted successfully");
    }

    @GetMapping("/{id}/parameters")
    public Map<String, Object> listParameters(@PathVariable UUID id) {
        require(id);
        List<LabDtos.ParameterView> params = parameterRepository.findByTestIdOrderByDisplayOrderAscNameAsc(id)
                .stream().map(LabDtos.ParameterView::of).toList();
        return Map.of("success", true, "data", params);
    }

    @PostMapping("/{id}/parameters")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String, Object> createParameter(@PathVariable UUID id, @RequestBody LabDtos.ParameterRequest req) {
        if (isBlank(req.name())) throw ApiException.badRequest("Parameter name is required");
        boolean genderSpecific = Boolean.TRUE.equals(req.genderSpecific());
        if (genderSpecific) {
            if (req.maleMin() == null || req.maleMax() == null || req.femaleMin() == null || req.femaleMax() == null) {
                throw ApiException.badRequest("Gender-specific ranges must include male and female min/max values");
            }
        } else if (req.minValue() == null || req.maxValue() == null) {
            throw ApiException.badRequest("General reference ranges (min_value, max_value) are required");
        }
        require(id);
        TestParameter p = new TestParameter();
        p.setTestId(id);
        p.setName(req.name());
        p.setUnit(req.unit());
        p.setMinValue(req.minValue());
        p.setMaxValue(req.maxValue());
        p.setGenderSpecific(genderSpecific);
        p.setMaleMin(req.maleMin());
        p.setMaleMax(req.maleMax());
        p.setFemaleMin(req.femaleMin());
        p.setFemaleMax(req.femaleMax());
        p.setDisplayOrder(req.displayOrder() != null ? req.displayOrder() : 0);
        p.setIsActive(req.isActive() != null ? req.isActive() : true);
        TestParameter saved = parameterRepository.save(p);
        return Map.of("success", true, "message", "Test parameter created successfully", "data", LabDtos.ParameterView.of(saved));
    }

    private LabTest require(UUID id) {
        return testRepository.findById(id).orElseThrow(() -> ApiException.notFound("Lab test not found"));
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
