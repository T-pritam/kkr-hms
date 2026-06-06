package tech.pritamrao.kkrhms.finances;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tech.pritamrao.kkrhms.security.AuthUser;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/finances")
@PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
public class FinanceController {

    private final FinanceService service;

    public FinanceController(FinanceService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public Map<String, Object> summary(@RequestParam(name = "month_year", required = false) String monthYear) {
        return service.summary(monthYear);
    }

    @GetMapping("/expenses")
    public Map<String, Object> listExpenses(@RequestParam(name = "month_year", required = false) String monthYear) {
        return service.listExpenses(monthYear);
    }

    @PostMapping("/expenses")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> createExpense(@RequestBody ExpenseRequest req) {
        return service.createExpense(req.expenseType(), req.amount(), req.expenseDate(), req.remarks());
    }

    @PutMapping("/expenses")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> updateExpense(@RequestBody ExpenseRequest req) {
        return service.updateExpense(req.id(), req.expenseType(), req.amount(), req.expenseDate(), req.remarks());
    }

    @DeleteMapping("/expenses")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> deleteExpense(@RequestParam Long id) {
        return service.deleteExpense(id);
    }

    @GetMapping("/referral-commissions")
    public Map<String, Object> referralCommissions(@RequestParam(required = false) Boolean settled,
                                                   @RequestParam(name = "referred_by", required = false) String referredBy) {
        return service.referralCommissions(settled, referredBy);
    }

    @PostMapping("/referral-commissions")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> settleReferralCommissions(@RequestBody SettleCommissionRequest req,
                                                         @AuthenticationPrincipal AuthUser user) {
        return service.settleReferralCommissions(req.billingIds(), req.paymentMethod(),
                req.transactionReference(), req.settlementNotes(), user.id());
    }

    @GetMapping("/doctor-settlements")
    public Map<String, Object> doctorSettlements(@RequestParam(required = false) Boolean settled,
                                                 @RequestParam(name = "doctor_id", required = false) UUID doctorId,
                                                 @RequestParam(name = "patient_id", required = false) UUID patientId) {
        return service.doctorSettlements(settled, doctorId, patientId);
    }

    @PostMapping("/doctor-settlements")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> settleDoctorSettlements(@RequestBody SettleDoctorRequest req,
                                                       @AuthenticationPrincipal AuthUser user) {
        return service.settleDoctorSettlements(req.settlementIds(), req.settlementAmount(), req.paymentMethod(),
                req.transactionReference(), req.settlementNotes(), user.id());
    }

    public record ExpenseRequest(Long id, String expenseType, BigDecimal amount, LocalDate expenseDate, String remarks) {}
    public record SettleCommissionRequest(List<UUID> billingIds, String paymentMethod, String transactionReference, String settlementNotes) {}
    public record SettleDoctorRequest(List<UUID> settlementIds, BigDecimal settlementAmount, String paymentMethod,
                                      String transactionReference, String settlementNotes) {}
}
