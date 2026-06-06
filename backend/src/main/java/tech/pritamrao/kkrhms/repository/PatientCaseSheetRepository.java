package tech.pritamrao.kkrhms.repository;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PatientCaseSheetRepository extends JpaRepository<PatientCaseSheet, UUID> {

    List<PatientCaseSheet> findByPatientIdOrderByCreatedAtDesc(UUID patientId);

    Optional<PatientCaseSheet> findByIdAndPatientId(UUID id, UUID patientId);
}
