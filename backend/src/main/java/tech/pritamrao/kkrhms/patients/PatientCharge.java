package tech.pritamrao.kkrhms.patients;

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
@Table(name = "patient_charges")
@Getter
@Setter
public class PatientCharge {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "patient_billing_id", nullable = false)
    private UUID patientBillingId;

    @Column(name = "patient_id", nullable = false)
    private UUID patientId;

    @Column(name = "charge_type", nullable = false)
    private String chargeType;

    private String description;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "charge_date", nullable = false)
    private LocalDate chargeDate;

    @Column(nullable = false)
    private Integer qty = 1;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;
}
