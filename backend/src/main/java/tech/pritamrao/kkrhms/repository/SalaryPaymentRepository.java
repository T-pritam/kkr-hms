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

public interface SalaryPaymentRepository extends JpaRepository<SalaryPayment, Long> {

    List<SalaryPayment> findByMonthYear(String monthYear);

    Optional<SalaryPayment> findByEmployeeIdAndMonthYear(UUID employeeId, String monthYear);

    List<SalaryPayment> findByMonthYearAndStatus(String monthYear, String status);

    List<SalaryPayment> findByEmployeeIdInAndMonthYearAndStatus(List<UUID> employeeIds, String monthYear, String status);
}
