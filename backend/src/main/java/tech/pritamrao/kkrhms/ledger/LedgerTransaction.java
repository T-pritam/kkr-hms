package tech.pritamrao.kkrhms.ledger;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "daily_ledger_transactions")
@Getter
@Setter
public class LedgerTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "transaction_date", nullable = false)
    private LocalDate transactionDate;

    @Column(name = "transaction_type", nullable = false)
    private String transactionType;

    @Column(nullable = false)
    private String source;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "payment_mode", nullable = false)
    private String paymentMode;

    private String referenceNumber;

    @Column(name = "patient_id")
    private UUID patientId;

    @Column(nullable = false)
    private String description;

    private String notes;
    private String status = "pending";

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    private Instant verifiedAt;

    @Column(name = "verified_by")
    private UUID verifiedBy;

    @CreationTimestamp
    private Instant createdAt;
}
