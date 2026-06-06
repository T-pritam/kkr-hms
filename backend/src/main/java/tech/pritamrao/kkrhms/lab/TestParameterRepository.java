package tech.pritamrao.kkrhms.lab;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TestParameterRepository extends JpaRepository<TestParameter, UUID> {

    List<TestParameter> findByTestIdOrderByDisplayOrderAscNameAsc(UUID testId);

    List<TestParameter> findByIdIn(List<UUID> ids);
}
