package tech.pritamrao.kkrhms.doctors;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DoctorVisitSettlementRepository extends JpaRepository<DoctorVisitSettlement, UUID> {

    List<DoctorVisitSettlement> findByPatientBillingIdOrderByCreatedAtDesc(UUID billingId);

    List<DoctorVisitSettlement> findByPatientIdAndDoctorIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID patientId, UUID doctorId);

    List<DoctorVisitSettlement> findByDoctorIdAndPatientIdAndSettledTrueAndDeletedAtIsNull(UUID doctorId, UUID patientId);

    List<DoctorVisitSettlement> findBySettledFalseAndDeletedAtIsNull();

    List<DoctorVisitSettlement> findByDeletedAtIsNullOrderByCreatedAtDesc();

    List<DoctorVisitSettlement> findByIdInAndDeletedAtIsNull(List<UUID> ids);
}
