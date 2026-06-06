package tech.pritamrao.kkrhms.dto;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class LabDtos {

    private LabDtos() {}

    public record LabTestView(UUID id, String name, String code, String category, String description,
                              String sampleType, BigDecimal price, Boolean isActive,
                              Instant createdAt, Instant updatedAt) {
        public static LabTestView of(LabTest t) {
            return new LabTestView(t.getId(), t.getName(), t.getCode(), t.getCategory(), t.getDescription(),
                    t.getSampleType(), t.getPrice(), t.getIsActive(), t.getCreatedAt(), t.getUpdatedAt());
        }
    }

    /** Embedded test form for result responses ({@code lab_tests:{...}}). */
    public record LabTestBrief(UUID id, String name, String code, String category, String sampleType, String description) {
        public static LabTestBrief of(LabTest t) {
            return t == null ? null : new LabTestBrief(t.getId(), t.getName(), t.getCode(), t.getCategory(),
                    t.getSampleType(), t.getDescription());
        }
    }

    public record LabTestRequest(String name, String code, String category, String description,
                                 String sampleType, BigDecimal price, Boolean isActive) {}

    public record ParameterView(UUID id, UUID testId, String name, String unit, BigDecimal minValue, BigDecimal maxValue,
                                Boolean genderSpecific, BigDecimal maleMin, BigDecimal maleMax, BigDecimal femaleMin,
                                BigDecimal femaleMax, Integer displayOrder, Boolean isActive, Instant createdAt) {
        public static ParameterView of(TestParameter p) {
            return new ParameterView(p.getId(), p.getTestId(), p.getName(), p.getUnit(), p.getMinValue(), p.getMaxValue(),
                    p.getGenderSpecific(), p.getMaleMin(), p.getMaleMax(), p.getFemaleMin(), p.getFemaleMax(),
                    p.getDisplayOrder(), p.getIsActive(), p.getCreatedAt());
        }
    }

    /** Embedded parameter form for value responses ({@code test_parameters:{...}}). */
    public record ParameterBrief(UUID id, String name, String unit, BigDecimal minValue, BigDecimal maxValue,
                                 Boolean genderSpecific, BigDecimal maleMin, BigDecimal maleMax, BigDecimal femaleMin,
                                 BigDecimal femaleMax, Integer displayOrder) {
        public static ParameterBrief of(TestParameter p) {
            return p == null ? null : new ParameterBrief(p.getId(), p.getName(), p.getUnit(), p.getMinValue(),
                    p.getMaxValue(), p.getGenderSpecific(), p.getMaleMin(), p.getMaleMax(), p.getFemaleMin(),
                    p.getFemaleMax(), p.getDisplayOrder());
        }
    }

    public record ParameterRequest(String name, String unit, BigDecimal minValue, BigDecimal maxValue,
                                   Boolean genderSpecific, BigDecimal maleMin, BigDecimal maleMax, BigDecimal femaleMin,
                                   BigDecimal femaleMax, Integer displayOrder, Boolean isActive) {}
}
