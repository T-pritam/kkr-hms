package tech.pritamrao.kkrhms.employees;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AdvanceRepository extends JpaRepository<Advance, Long> {

    List<Advance> findByMonthYearOrderByDateGivenDesc(String monthYear);

    List<Advance> findByEmployeeIdAndMonthYearOrderByDateGivenDesc(UUID employeeId, String monthYear);

    List<Advance> findByEmployeeIdInAndMonthYear(List<UUID> employeeIds, String monthYear);
}
