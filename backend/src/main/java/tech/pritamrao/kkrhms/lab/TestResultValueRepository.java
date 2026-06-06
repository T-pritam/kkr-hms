package tech.pritamrao.kkrhms.lab;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TestResultValueRepository extends JpaRepository<TestResultValue, UUID> {

    List<TestResultValue> findByResultId(UUID resultId);

    Optional<TestResultValue> findByResultIdAndParameterId(UUID resultId, UUID parameterId);

    Optional<TestResultValue> findByIdAndResultId(UUID id, UUID resultId);
}
