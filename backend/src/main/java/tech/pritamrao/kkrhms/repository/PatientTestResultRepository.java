package tech.pritamrao.kkrhms.repository;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.UUID;

public interface PatientTestResultRepository extends JpaRepository<PatientTestResult, UUID> {

    @Query("""
            select r from PatientTestResult r
            where (:status is null or r.status = :status)
              and (:testId is null or r.testId = :testId)
              and (:patientId is null or r.patientId = :patientId)
              and (:fromDate is null or r.testDate >= :fromDate)
              and (:toDate is null or r.testDate <= :toDate)
            order by r.testDate desc, r.createdAt desc
            """)
    Page<PatientTestResult> search(@Param("status") String status,
                                   @Param("testId") UUID testId,
                                   @Param("patientId") UUID patientId,
                                   @Param("fromDate") LocalDate fromDate,
                                   @Param("toDate") LocalDate toDate,
                                   Pageable pageable);

    Page<PatientTestResult> findByPatientIdOrderByTestDateDescCreatedAtDesc(UUID patientId, Pageable pageable);
}
