package tech.pritamrao.kkrhms.entity;

import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "test_parameters")
@Getter
@Setter
public class TestParameter {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "test_id", nullable = false)
    private UUID testId;

    @Column(nullable = false)
    private String name;

    private String unit;
    private BigDecimal minValue;
    private BigDecimal maxValue;
    private Boolean genderSpecific = false;
    private BigDecimal maleMin;
    private BigDecimal maleMax;
    private BigDecimal femaleMin;
    private BigDecimal femaleMax;
    private Integer displayOrder = 0;
    private Boolean isActive = true;

    @CreationTimestamp
    private Instant createdAt;
}
