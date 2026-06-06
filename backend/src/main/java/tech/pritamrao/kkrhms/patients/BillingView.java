package tech.pritamrao.kkrhms.patients;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Full {@code patient_billing} row as returned to the client. */
public record BillingView(
        UUID id, UUID patientId, BigDecimal baseCharge, BigDecimal referralCommissionAmount,
        Boolean referralSettled, Instant referralSettlementDate, String referralSettlementNotes,
        BigDecimal totalDoctorFees, String billingStatus, BigDecimal patientChargesTotal,
        BigDecimal totalCharges, BigDecimal patientPaidAmount, String paymentStatus,
        LocalDate joinedDate, String monthYear, String referralTransactionRef,
        String referralSettlementPaymentMethod, UUID createdBy, UUID updatedBy,
        Instant createdAt, Instant updatedAt) {

    public static BillingView of(PatientBilling b) {
        return new BillingView(b.getId(), b.getPatientId(), b.getBaseCharge(), b.getReferralCommissionAmount(),
                b.getReferralSettled(), b.getReferralSettlementDate(), b.getReferralSettlementNotes(),
                b.getTotalDoctorFees(), b.getBillingStatus(), b.getPatientChargesTotal(), b.getTotalCharges(),
                b.getPatientPaidAmount(), b.getPaymentStatus(), b.getJoinedDate(), b.getMonthYear(),
                b.getReferralTransactionRef(), b.getReferralSettlementPaymentMethod(), b.getCreatedBy(),
                b.getUpdatedBy(), b.getCreatedAt(), b.getUpdatedAt());
    }
}
