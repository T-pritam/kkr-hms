package tech.pritamrao.kkrhms.patients;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface PatientChargeRepository extends JpaRepository<PatientCharge, UUID> {

    List<PatientCharge> findByPatientIdOrderByChargeDateDesc(UUID patientId);

    List<PatientCharge> findByPatientIdAndPatientBillingIdOrderByChargeDateDesc(UUID patientId, UUID billingId);

    List<PatientCharge> findByPatientBillingId(UUID billingId);

    List<PatientCharge> findByChargeDateBetween(LocalDate from, LocalDate to);
}
