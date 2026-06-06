package tech.pritamrao.kkrhms.patients;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PatientCaseSheetRepository extends JpaRepository<PatientCaseSheet, UUID> {

    List<PatientCaseSheet> findByPatientIdOrderByCreatedAtDesc(UUID patientId);

    Optional<PatientCaseSheet> findByIdAndPatientId(UUID id, UUID patientId);
}
