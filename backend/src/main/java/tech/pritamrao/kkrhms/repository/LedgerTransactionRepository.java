package tech.pritamrao.kkrhms.repository;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface LedgerTransactionRepository extends JpaRepository<LedgerTransaction, UUID> {

    @Query("""
            select t from LedgerTransaction t
            where (:startDate is null or t.transactionDate >= :startDate)
              and (:endDate is null or t.transactionDate <= :endDate)
              and (:transactionType is null or t.transactionType = :transactionType)
              and (:source is null or t.source = :source)
              and (:paymentMode is null or t.paymentMode = :paymentMode)
              and (:status is null or t.status = :status)
              and (:patientId is null or t.patientId = :patientId)
              and (:createdBy is null or t.createdBy = :createdBy)
            order by t.transactionDate desc, t.createdAt desc
            """)
    List<LedgerTransaction> search(@Param("startDate") LocalDate startDate,
                                   @Param("endDate") LocalDate endDate,
                                   @Param("transactionType") String transactionType,
                                   @Param("source") String source,
                                   @Param("paymentMode") String paymentMode,
                                   @Param("status") String status,
                                   @Param("patientId") UUID patientId,
                                   @Param("createdBy") UUID createdBy);

    List<LedgerTransaction> findByTransactionDateAndCreatedByOrderByCreatedAtDesc(LocalDate date, UUID createdBy);

    List<LedgerTransaction> findByTransactionDate(LocalDate date);

    List<LedgerTransaction> findByTransactionDateOrderByCreatedAtDesc(LocalDate date);

    List<LedgerTransaction> findByCreatedByAndTransactionDate(UUID createdBy, LocalDate date);

    boolean existsByTransactionDateAndStatus(LocalDate date, String status);

    List<LedgerTransaction> findByTransactionDateBetweenAndTransactionTypeAndSource(
            LocalDate from, LocalDate to, String transactionType, String source);

    List<LedgerTransaction> findByTransactionDateBetween(LocalDate from, LocalDate to);
}
