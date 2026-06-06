package tech.pritamrao.kkrhms.doctors;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "doctor_visit_settlements")
@Getter
@Setter
public class DoctorVisitSettlement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "patient_billing_id")
    private UUID patientBillingId;

    @Column(name = "patient_id", nullable = false)
    private UUID patientId;

    @Column(name = "doctor_id", nullable = false)
    private UUID doctorId;

    private Integer visitCount = 0;
    private BigDecimal amountPerVisit = BigDecimal.ZERO;
    private BigDecimal totalAmount;
    private Boolean settled = false;
    private Instant settlementDate;
    private BigDecimal settlementAmount = BigDecimal.ZERO;
    private String settlementNotes;
    private String paymentMethod;
    private String transactionReference;
    private String settlementType = "regular";

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "updated_by")
    private UUID updatedBy;

    private Instant deletedAt;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;
}
