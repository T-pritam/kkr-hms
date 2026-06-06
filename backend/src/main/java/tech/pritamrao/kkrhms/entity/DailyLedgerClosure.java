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

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "daily_ledger_closures")
@Getter
@Setter
public class DailyLedgerClosure {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "closure_date", nullable = false)
    private LocalDate closureDate;

    private BigDecimal totalCreditsCash = BigDecimal.ZERO;
    private BigDecimal totalCreditsUpi = BigDecimal.ZERO;
    private BigDecimal totalCreditsOther = BigDecimal.ZERO;

    @Column(name = "total_credits", nullable = false)
    private BigDecimal totalCredits;

    @Column(name = "total_debits", nullable = false)
    private BigDecimal totalDebits;

    @Column(name = "net_balance", nullable = false)
    private BigDecimal netBalance;

    private Integer transactionCount = 0;
    private Integer creditCount = 0;
    private Integer debitCount = 0;

    private Instant closedAt;

    @Column(name = "closed_by", nullable = false)
    private UUID closedBy;

    private String notes;

    private BigDecimal openingBalance = BigDecimal.ZERO;

    @Column(name = "closing_balance", nullable = false)
    private BigDecimal closingBalance;
}
