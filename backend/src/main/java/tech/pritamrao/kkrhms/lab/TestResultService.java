package tech.pritamrao.kkrhms.lab;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.pritamrao.kkrhms.common.ApiException;
import tech.pritamrao.kkrhms.users.User;
import tech.pritamrao.kkrhms.users.UserBrief;
import tech.pritamrao.kkrhms.users.UserRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class TestResultService {

    private final PatientTestResultRepository resultRepository;
    private final TestResultValueRepository valueRepository;
    private final TestParameterRepository parameterRepository;
    private final LabTestRepository testRepository;
    private final UserRepository userRepository;

    public TestResultService(PatientTestResultRepository resultRepository, TestResultValueRepository valueRepository,
                             TestParameterRepository parameterRepository, LabTestRepository testRepository,
                             UserRepository userRepository) {
        this.resultRepository = resultRepository;
        this.valueRepository = valueRepository;
        this.parameterRepository = parameterRepository;
        this.testRepository = testRepository;
        this.userRepository = userRepository;
    }

    public record ResultView(Map<String, Object> data) {}

    public Map<String, Object> list(String status, UUID testId, UUID patientId, LocalDate fromDate, LocalDate toDate,
                                    int page, int pageSize) {
        int size = Math.min(pageSize, 100);
        Page<PatientTestResult> result = resultRepository.search(status, testId, patientId, fromDate, toDate,
                PageRequest.of(Math.max(page - 1, 0), size));
        return paged(result, page, size);
    }

    @Transactional
    public Map<String, Object> create(CreateResultRequest req) {
        if (req.testId() == null || req.price() == null) {
            throw ApiException.badRequest("test_id and price are required");
        }
        if (req.patientName() == null || req.patientName().isBlank()) {
            throw ApiException.badRequest("patient_name is required");
        }
        PatientTestResult r = new PatientTestResult();
        r.setPatientId(req.patientId());
        r.setTestId(req.testId());
        r.setTestDate(req.testDate() != null ? req.testDate() : LocalDate.now());
        BigDecimal discount = req.discount() != null ? req.discount() : BigDecimal.ZERO;
        r.setPrice(req.price());
        r.setDiscount(discount);
        r.setFinalPrice(req.price().subtract(discount));
        r.setStatus("pending");
        r.setReferenceDoctorId(req.referenceDoctorId());
        r.setPatientName(req.patientName());
        r.setPatientPhone(req.patientPhone());
        r.setPatientAge(req.patientAge());
        r.setPatientGender(req.patientGender());
        r.setNotes(req.notes());
        PatientTestResult saved = resultRepository.save(r);
        return Map.of("success", true, "message", "Test order created successfully", "data", resultWithTest(saved));
    }

    public Map<String, Object> get(UUID id) {
        PatientTestResult r = require(id);
        Map<String, Object> data = baseResult(r);
        data.put("lab_tests", LabDtos.LabTestBrief.of(testRepository.findById(r.getTestId()).orElse(null)));
        data.put("reference_doctor", userBrief(r.getReferenceDoctorId()));
        data.put("conducted_by_user", userBrief(r.getConductedBy()));
        data.put("verified_by_user", userBrief(r.getVerifiedBy()));
        data.put("values", valuesForResult(id));
        return Map.of("success", true, "data", data);
    }

    @Transactional
    public Map<String, Object> update(UUID id, UpdateResultRequest req) {
        PatientTestResult r = require(id);
        if (req.testDate() != null) r.setTestDate(req.testDate());
        if (req.sampleCollectedAt() != null) r.setSampleCollectedAt(req.sampleCollectedAt());
        if (req.resultIssuedAt() != null) r.setResultIssuedAt(req.resultIssuedAt());
        if (req.status() != null) r.setStatus(req.status());
        if (req.referenceDoctorId() != null) r.setReferenceDoctorId(req.referenceDoctorId());
        if (req.conductedBy() != null) r.setConductedBy(req.conductedBy());
        if (req.verifiedBy() != null) r.setVerifiedBy(req.verifiedBy());
        if (req.notes() != null) r.setNotes(req.notes());
        if (req.patientName() != null) r.setPatientName(req.patientName());
        if (req.patientPhone() != null) r.setPatientPhone(req.patientPhone());
        if (req.patientAge() != null) r.setPatientAge(req.patientAge());
        if (req.patientGender() != null) r.setPatientGender(req.patientGender());
        if (req.price() != null) r.setPrice(req.price());
        if (req.discount() != null) r.setDiscount(req.discount());
        if (req.price() != null || req.discount() != null) {
            BigDecimal price = r.getPrice() != null ? r.getPrice() : BigDecimal.ZERO;
            BigDecimal discount = r.getDiscount() != null ? r.getDiscount() : BigDecimal.ZERO;
            r.setFinalPrice(price.subtract(discount));
        }
        PatientTestResult saved = resultRepository.save(r);
        return Map.of("success", true, "message", "Test result updated successfully", "data", baseResult(saved));
    }

    @Transactional
    public Map<String, Object> delete(UUID id) {
        valueRepository.findByResultId(id).forEach(valueRepository::delete);
        resultRepository.deleteById(id);
        return Map.of("success", true, "message", "Test result deleted successfully");
    }

    public Map<String, Object> listValues(UUID resultId) {
        return Map.of("success", true, "data", valuesForResult(resultId));
    }

    @Transactional
    public Map<String, Object> saveValues(UUID resultId, List<ValueInput> values) {
        if (values == null || values.isEmpty()) throw ApiException.badRequest("Values array is required");
        PatientTestResult result = require(resultId);
        String gender = result.getPatientGender();

        List<UUID> paramIds = values.stream().map(ValueInput::parameterId).toList();
        Map<UUID, TestParameter> params = parameterRepository.findByIdIn(paramIds).stream()
                .collect(Collectors.toMap(TestParameter::getId, p -> p));

        for (ValueInput v : values) {
            TestParameter param = params.get(v.parameterId());
            if (param == null) throw ApiException.badRequest("Parameter " + v.parameterId() + " not found");
            BigDecimal[] range = referenceRange(param, gender);
            String flag = v.flag() != null ? v.flag() : computeFlag(v.value(), range[0], range[1]);

            TestResultValue entity = valueRepository.findByResultIdAndParameterId(resultId, v.parameterId())
                    .orElseGet(TestResultValue::new);
            entity.setResultId(resultId);
            entity.setParameterId(v.parameterId());
            entity.setValue(v.value());
            entity.setTextValue(v.textValue());
            entity.setFlag(flag);
            entity.setUnit(param.getUnit());
            entity.setRefMin(range[0]);
            entity.setRefMax(range[1]);
            entity.setNotes(v.notes());
            valueRepository.save(entity);
        }

        if (List.of("pending", "collected", "processing").contains(result.getStatus())) {
            result.setStatus("completed");
            resultRepository.save(result);
        }
        return Map.of("success", true, "message", "Test result values created successfully", "data", valuesForResult(resultId));
    }

    @Transactional
    public Map<String, Object> updateValue(UUID resultId, UUID valueId, ValueInput req) {
        TestResultValue value = valueRepository.findByIdAndResultId(valueId, resultId)
                .orElseThrow(() -> ApiException.notFound("Test result value not found"));
        if (req.value() != null) {
            value.setValue(req.value());
            TestParameter param = parameterRepository.findById(value.getParameterId()).orElse(null);
            PatientTestResult result = resultRepository.findById(resultId).orElse(null);
            String gender = result != null ? result.getPatientGender() : null;
            if (param != null) {
                BigDecimal[] range = referenceRange(param, gender);
                value.setRefMin(range[0]);
                value.setRefMax(range[1]);
                value.setFlag(req.flag() != null ? req.flag() : computeFlag(req.value(), range[0], range[1]));
            }
        } else if (req.flag() != null) {
            value.setFlag(req.flag());
        }
        if (req.textValue() != null) value.setTextValue(req.textValue());
        if (req.notes() != null) value.setNotes(req.notes());
        TestResultValue saved = valueRepository.save(value);
        return Map.of("success", true, "message", "Test result value updated successfully", "data", valueView(saved));
    }

    @Transactional
    public Map<String, Object> deleteValue(UUID resultId, UUID valueId) {
        valueRepository.findByIdAndResultId(valueId, resultId).ifPresent(valueRepository::delete);
        return Map.of("success", true, "message", "Test result value deleted successfully");
    }

    public Map<String, Object> patientResults(UUID patientId, int page, int pageSize) {
        int size = Math.min(pageSize, 100);
        Page<PatientTestResult> result = resultRepository
                .findByPatientIdOrderByTestDateDescCreatedAtDesc(patientId, PageRequest.of(Math.max(page - 1, 0), size));
        List<Map<String, Object>> rows = result.getContent().stream().map(r -> {
            Map<String, Object> m = baseResult(r);
            m.put("lab_tests", LabDtos.LabTestBrief.of(testRepository.findById(r.getTestId()).orElse(null)));
            m.put("reference_doctor", userBrief(r.getReferenceDoctorId()));
            m.put("verified_by_user", userBrief(r.getVerifiedBy()));
            return m;
        }).toList();
        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("page", page);
        pagination.put("pageSize", size);
        pagination.put("total", result.getTotalElements());
        pagination.put("totalPages", result.getTotalPages());
        return Map.of("success", true, "data", Map.of("results", rows, "pagination", pagination));
    }

    // ── helpers ───────────────────────────────────────────────────────────
    private Map<String, Object> paged(Page<PatientTestResult> result, int page, int size) {
        List<Map<String, Object>> rows = result.getContent().stream().map(this::resultWithTest).toList();
        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("page", page);
        pagination.put("pageSize", size);
        pagination.put("total", result.getTotalElements());
        pagination.put("totalPages", result.getTotalPages());
        return Map.of("success", true, "data", Map.of("data", rows, "pagination", pagination));
    }

    private Map<String, Object> resultWithTest(PatientTestResult r) {
        Map<String, Object> m = baseResult(r);
        m.put("lab_tests", LabDtos.LabTestBrief.of(testRepository.findById(r.getTestId()).orElse(null)));
        return m;
    }

    private Map<String, Object> baseResult(PatientTestResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("patient_id", r.getPatientId());
        m.put("test_id", r.getTestId());
        m.put("test_date", r.getTestDate());
        m.put("sample_collected_at", r.getSampleCollectedAt());
        m.put("result_issued_at", r.getResultIssuedAt());
        m.put("price", r.getPrice());
        m.put("discount", r.getDiscount());
        m.put("final_price", r.getFinalPrice());
        m.put("status", r.getStatus());
        m.put("reference_doctor_id", r.getReferenceDoctorId());
        m.put("conducted_by", r.getConductedBy());
        m.put("verified_by", r.getVerifiedBy());
        m.put("notes", r.getNotes());
        m.put("patient_name", r.getPatientName());
        m.put("patient_phone", r.getPatientPhone());
        m.put("patient_age", r.getPatientAge());
        m.put("patient_gender", r.getPatientGender());
        m.put("created_at", r.getCreatedAt());
        m.put("updated_at", r.getUpdatedAt());
        return m;
    }

    private List<Map<String, Object>> valuesForResult(UUID resultId) {
        return valueRepository.findByResultId(resultId).stream()
                .map(this::valueView)
                .sorted((a, b) -> Integer.compare(order(a), order(b)))
                .toList();
    }

    private int order(Map<String, Object> valueView) {
        Object tp = valueView.get("test_parameters");
        if (tp instanceof LabDtos.ParameterBrief brief && brief.displayOrder() != null) return brief.displayOrder();
        return 0;
    }

    private Map<String, Object> valueView(TestResultValue v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", v.getId());
        m.put("result_id", v.getResultId());
        m.put("parameter_id", v.getParameterId());
        m.put("value", v.getValue());
        m.put("text_value", v.getTextValue());
        m.put("flag", v.getFlag());
        m.put("unit", v.getUnit());
        m.put("ref_min", v.getRefMin());
        m.put("ref_max", v.getRefMax());
        m.put("notes", v.getNotes());
        m.put("created_at", v.getCreatedAt());
        m.put("test_parameters", LabDtos.ParameterBrief.of(parameterRepository.findById(v.getParameterId()).orElse(null)));
        return m;
    }

    private UserBrief userBrief(UUID id) {
        if (id == null) return null;
        return userRepository.findById(id).map(UserBrief::of).orElse(null);
    }

    private BigDecimal[] referenceRange(TestParameter p, String gender) {
        if (Boolean.TRUE.equals(p.getGenderSpecific()) && gender != null) {
            if ("male".equalsIgnoreCase(gender)) return new BigDecimal[]{p.getMaleMin(), p.getMaleMax()};
            if ("female".equalsIgnoreCase(gender)) return new BigDecimal[]{p.getFemaleMin(), p.getFemaleMax()};
        }
        return new BigDecimal[]{p.getMinValue(), p.getMaxValue()};
    }

    private String computeFlag(BigDecimal value, BigDecimal refMin, BigDecimal refMax) {
        if (value == null || refMin == null || refMax == null) return "normal";
        String flag = "normal";
        if (value.compareTo(refMin) < 0) flag = "low";
        else if (value.compareTo(refMax) > 0) flag = "high";
        if (value.compareTo(refMin.multiply(new BigDecimal("0.5"))) < 0
                || value.compareTo(refMax.multiply(new BigDecimal("1.5"))) > 0) {
            flag = "critical";
        }
        return flag;
    }

    private PatientTestResult require(UUID id) {
        return resultRepository.findById(id).orElseThrow(() -> ApiException.notFound("Test result not found"));
    }

    // ── request payloads ──────────────────────────────────────────────────
    public record CreateResultRequest(UUID patientId, UUID testId, LocalDate testDate, BigDecimal price,
                                      BigDecimal discount, UUID referenceDoctorId, String patientName,
                                      String patientPhone, Integer patientAge, String patientGender, String notes) {}

    public record UpdateResultRequest(LocalDate testDate, java.time.Instant sampleCollectedAt,
                                      java.time.Instant resultIssuedAt, BigDecimal price, BigDecimal discount,
                                      String status, UUID referenceDoctorId, UUID conductedBy, UUID verifiedBy,
                                      String notes, String patientName, String patientPhone, Integer patientAge,
                                      String patientGender) {}

    public record ValueInput(UUID parameterId, BigDecimal value, String textValue, String flag, String notes) {}
}
