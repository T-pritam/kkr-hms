package tech.pritamrao.kkrhms.repository;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PatientBillingRepository extends JpaRepository<PatientBilling, UUID> {

    List<PatientBilling> findByPatientIdOrderByCreatedAtDesc(UUID patientId);

    List<PatientBilling> findByMonthYear(String monthYear);

    List<PatientBilling> findByReferralCommissionAmountGreaterThanOrderByCreatedAtDesc(java.math.BigDecimal amount);

    List<PatientBilling> findByReferralSettledFalseAndReferralCommissionAmountGreaterThan(java.math.BigDecimal amount);
}
