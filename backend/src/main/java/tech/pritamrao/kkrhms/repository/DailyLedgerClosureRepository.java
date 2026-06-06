package tech.pritamrao.kkrhms.repository;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface DailyLedgerClosureRepository extends JpaRepository<DailyLedgerClosure, UUID> {
    Optional<DailyLedgerClosure> findByClosureDate(LocalDate date);
    boolean existsByClosureDate(LocalDate date);
}
