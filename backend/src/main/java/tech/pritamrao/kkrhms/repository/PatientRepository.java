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

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PatientRepository extends JpaRepository<Patient, UUID> {

    Optional<Patient> findByPatientId(String patientId);

    boolean existsByPatientId(String patientId);

    boolean existsByPatientIdAndIdNot(String patientId, UUID id);

    List<Patient> findByStatusNotIgnoreCaseOrderByNameAsc(String status);

    @Query("""
            select p from Patient p
            where (:search is null or :search = ''
                   or lower(p.name) like lower(concat('%', :search, '%'))
                   or lower(p.patientId) like lower(concat('%', :search, '%'))
                   or lower(p.phone) like lower(concat('%', :search, '%')))
            order by p.dateOfJoin desc, p.createdAt desc
            """)
    Page<Patient> search(@Param("search") String search, Pageable pageable);

    List<Patient> findByReferredBy(String referredBy);
}
