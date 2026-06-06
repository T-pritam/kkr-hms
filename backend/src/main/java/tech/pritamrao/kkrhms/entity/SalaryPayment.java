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
@Table(name = "salary_payments")
@Getter
@Setter
public class SalaryPayment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Column(name = "month_year", nullable = false)
    private String monthYear;

    @Column(name = "base_salary", nullable = false)
    private BigDecimal baseSalary;

    @Column(name = "total_working_days", nullable = false)
    private Integer totalWorkingDays = 27;

    @Column(name = "days_present", nullable = false)
    private Integer daysPresent;

    private BigDecimal totalAdvance = BigDecimal.ZERO;
    private BigDecimal calculatedSalary;
    private BigDecimal finalSalary;
    private String status = "pending";
    private LocalDate settledOn;

    @Column(name = "ot_days", nullable = false)
    private Integer otDays = 0;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;
}
