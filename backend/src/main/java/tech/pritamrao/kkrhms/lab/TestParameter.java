package tech.pritamrao.kkrhms.lab;

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
