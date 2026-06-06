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

public interface AdvanceRepository extends JpaRepository<Advance, Long> {

    List<Advance> findByMonthYearOrderByDateGivenDesc(String monthYear);

    List<Advance> findByEmployeeIdAndMonthYearOrderByDateGivenDesc(UUID employeeId, String monthYear);

    List<Advance> findByEmployeeIdInAndMonthYear(List<UUID> employeeIds, String monthYear);
}
