package tech.pritamrao.kkrhms.doctors;

import tech.pritamrao.kkrhms.patients.PatientBrief;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Full {@code doctor_visit_settlements} row with embedded doctor & patient. */
public record SettlementView(
        UUID id, UUID patientBillingId, UUID patientId, UUID doctorId, Integer visitCount,
        BigDecimal amountPerVisit, BigDecimal totalAmount, Boolean settled, Instant settlementDate,
        BigDecimal settlementAmount, String settlementNotes, String paymentMethod, String transactionReference,
        String settlementType, Instant createdAt, Instant updatedAt,
        DoctorDtos.DoctorBrief doctor, PatientBrief patient) {

    public static SettlementView of(DoctorVisitSettlement s, Doctor doctor,
                                    tech.pritamrao.kkrhms.patients.Patient patient) {
        return new SettlementView(s.getId(), s.getPatientBillingId(), s.getPatientId(), s.getDoctorId(),
                s.getVisitCount(), s.getAmountPerVisit(), s.getTotalAmount(), s.getSettled(), s.getSettlementDate(),
                s.getSettlementAmount(), s.getSettlementNotes(), s.getPaymentMethod(), s.getTransactionReference(),
                s.getSettlementType(), s.getCreatedAt(), s.getUpdatedAt(),
                DoctorDtos.DoctorBrief.of(doctor), PatientBrief.of(patient));
    }
}
