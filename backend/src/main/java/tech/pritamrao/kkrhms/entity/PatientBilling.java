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
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "patient_billing")
@Getter
@Setter
public class PatientBilling {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "patient_id", nullable = false)
    private UUID patientId;

    private BigDecimal baseCharge = BigDecimal.ZERO;
    private BigDecimal referralCommissionAmount = BigDecimal.ZERO;
    private Boolean referralSettled = false;
    private Instant referralSettlementDate;
    private String referralSettlementNotes;
    private BigDecimal totalDoctorFees = BigDecimal.ZERO;
    private String billingStatus = "pending";

    @Column(name = "patient_charges_total", nullable = false)
    private BigDecimal patientChargesTotal = BigDecimal.ZERO;

    private BigDecimal totalCharges;
    private BigDecimal patientPaidAmount = BigDecimal.ZERO;
    private String paymentStatus = "active";
    private LocalDate joinedDate;
    private String monthYear;
    private String referralTransactionRef;
    private String referralSettlementPaymentMethod;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;
}
