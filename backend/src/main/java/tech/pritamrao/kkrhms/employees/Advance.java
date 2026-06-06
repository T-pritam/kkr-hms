package tech.pritamrao.kkrhms.employees;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "advances")
@Getter
@Setter
public class Advance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "date_given", nullable = false)
    private LocalDate dateGiven;

    @Column(name = "month_year", nullable = false)
    private String monthYear;

    private String remarks;

    @CreationTimestamp
    private Instant createdAt;
}
