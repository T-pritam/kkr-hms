package tech.pritamrao.kkrhms.lab;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "test_result_values")
@Getter
@Setter
public class TestResultValue {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "result_id", nullable = false)
    private UUID resultId;

    @Column(name = "parameter_id", nullable = false)
    private UUID parameterId;

    private BigDecimal value;
    private String textValue;
    private String flag = "normal";
    private String unit;
    private BigDecimal refMin;
    private BigDecimal refMax;
    private String notes;

    @CreationTimestamp
    private Instant createdAt;
}
