package tech.pritamrao.kkrhms.ledger;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface DailyLedgerClosureRepository extends JpaRepository<DailyLedgerClosure, UUID> {
    Optional<DailyLedgerClosure> findByClosureDate(LocalDate date);
    boolean existsByClosureDate(LocalDate date);
}
