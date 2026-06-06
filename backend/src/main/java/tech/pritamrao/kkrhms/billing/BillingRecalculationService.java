package tech.pritamrao.kkrhms.billing;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.pritamrao.kkrhms.doctors.DoctorVisitSettlement;
import tech.pritamrao.kkrhms.doctors.DoctorVisitSettlementRepository;
import tech.pritamrao.kkrhms.patients.PatientBilling;
import tech.pritamrao.kkrhms.patients.PatientBillingRepository;
import tech.pritamrao.kkrhms.patients.PatientCharge;
import tech.pritamrao.kkrhms.patients.PatientChargeRepository;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Port of the original {@code lib/recalculate-billing.ts}. Recomputes a billing
 * record's derived totals from its source rows after any charge/settlement/billing
 * mutation:
 * <pre>
 *   total_charges = base_charge + Σ(charge.amount × qty) + Σ(settlement.total_amount) + referral_commission
 * </pre>
 * The {@code *_included_in_package} flags referenced by the original code do not
 * exist in the live schema, so they are treated as {@code false} (always included).
 */
@Service
public class BillingRecalculationService {

    private final PatientBillingRepository billingRepository;
    private final PatientChargeRepository chargeRepository;
    private final DoctorVisitSettlementRepository settlementRepository;

    public BillingRecalculationService(PatientBillingRepository billingRepository,
                                       PatientChargeRepository chargeRepository,
                                       DoctorVisitSettlementRepository settlementRepository) {
        this.billingRepository = billingRepository;
        this.chargeRepository = chargeRepository;
        this.settlementRepository = settlementRepository;
    }

    @Transactional
    public void recalculate(UUID billingId) {
        if (billingId == null) return;
        PatientBilling billing = billingRepository.findById(billingId).orElse(null);
        if (billing == null) return;

        BigDecimal patientChargesTotal = chargeRepository.findByPatientBillingId(billingId).stream()
                .map(this::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalDoctorFees = settlementRepository.findByPatientBillingIdOrderByCreatedAtDesc(billingId).stream()
                .filter(s -> s.getDeletedAt() == null)
                .map(s -> nz(s.getTotalAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal baseCharge = nz(billing.getBaseCharge());
        BigDecimal referralCommission = nz(billing.getReferralCommissionAmount());
        BigDecimal totalCharges = baseCharge.add(patientChargesTotal).add(totalDoctorFees).add(referralCommission);

        billing.setPatientChargesTotal(patientChargesTotal);
        billing.setTotalDoctorFees(totalDoctorFees);
        billing.setTotalCharges(totalCharges);
        billingRepository.save(billing);
    }

    private BigDecimal lineTotal(PatientCharge charge) {
        int qty = charge.getQty() != null ? charge.getQty() : 1;
        return nz(charge.getAmount()).multiply(BigDecimal.valueOf(qty));
    }

    private BigDecimal nz(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }
}
