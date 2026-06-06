package tech.pritamrao.kkrhms.patients;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PatientBillingRepository extends JpaRepository<PatientBilling, UUID> {

    List<PatientBilling> findByPatientIdOrderByCreatedAtDesc(UUID patientId);

    List<PatientBilling> findByMonthYear(String monthYear);

    List<PatientBilling> findByReferralCommissionAmountGreaterThanOrderByCreatedAtDesc(java.math.BigDecimal amount);

    List<PatientBilling> findByReferralSettledFalseAndReferralCommissionAmountGreaterThan(java.math.BigDecimal amount);
}
