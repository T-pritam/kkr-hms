package tech.pritamrao.kkrhms.patients;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface PatientBillingInstallmentRepository extends JpaRepository<PatientBillingInstallment, UUID> {

    List<PatientBillingInstallment> findByPatientBillingIdOrderByInstallmentNumberAsc(UUID billingId);

    List<PatientBillingInstallment> findByPaymentDateBetween(LocalDate from, LocalDate to);
}
