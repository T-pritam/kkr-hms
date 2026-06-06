package tech.pritamrao.kkrhms.patients;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PatientConsultationRepository extends JpaRepository<PatientConsultation, UUID> {

    List<PatientConsultation> findByPatientIdAndDeletedAtIsNullOrderByConsultationDateDesc(UUID patientId);

    List<PatientConsultation> findByPatientIdAndBillingIdAndDeletedAtIsNullOrderByConsultationDateAsc(UUID patientId, UUID billingId);

    long countByPatientIdAndDoctorIdAndDeletedAtIsNull(UUID patientId, UUID doctorId);
}
