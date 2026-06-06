package tech.pritamrao.kkrhms.employees;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EmployeeRepository extends JpaRepository<Employee, UUID> {

    List<Employee> findByStatusOrderByNameAsc(String status);

    List<Employee> findByIdInAndStatusOrderByNameAsc(List<UUID> ids, String status);

    List<Employee> findAllByOrderByNameAsc();
}
