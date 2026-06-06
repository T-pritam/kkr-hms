package tech.pritamrao.kkrhms.lab;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "patient_test_results")
@Getter
@Setter
public class PatientTestResult {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "patient_id")
    private UUID patientId;

    @Column(name = "test_id", nullable = false)
    private UUID testId;

    @Column(name = "test_date", nullable = false)
    private LocalDate testDate;

    private Instant sampleCollectedAt;
    private Instant resultIssuedAt;

    @Column(nullable = false)
    private BigDecimal price = BigDecimal.ZERO;

    private BigDecimal discount = BigDecimal.ZERO;
    private BigDecimal finalPrice;
    private String status = "pending";

    @Column(name = "reference_doctor_id")
    private UUID referenceDoctorId;

    @Column(name = "conducted_by")
    private UUID conductedBy;

    @Column(name = "verified_by")
    private UUID verifiedBy;

    private String notes;
    private String patientName;
    private String patientPhone;
    private Integer patientAge;
    private String patientGender;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;
}
