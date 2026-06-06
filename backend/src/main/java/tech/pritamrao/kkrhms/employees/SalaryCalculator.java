package tech.pritamrao.kkrhms.employees;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Salary maths shared across the salary endpoints, matching the original rules:
 * a 27-day working month, daily rate = base/30, OT only valid at full attendance
 * (max 3 days), final = calculated − advances.
 */
public final class SalaryCalculator {

    private SalaryCalculator() {}

    public record Result(BigDecimal calculatedSalary, BigDecimal finalSalary, int validOtDays) {}

    public static Result compute(BigDecimal baseSalary, int daysPresent, int otDays, BigDecimal totalAdvance) {
        int validOt = daysPresent == 27 ? otDays : 0;
        BigDecimal dailyRate = baseSalary.divide(BigDecimal.valueOf(30), 6, RoundingMode.HALF_UP);
        BigDecimal regular = baseSalary.subtract(dailyRate.multiply(BigDecimal.valueOf(27L - daysPresent)));
        BigDecimal ot = dailyRate.multiply(BigDecimal.valueOf(validOt));
        BigDecimal calculated = regular.add(ot).setScale(2, RoundingMode.HALF_UP);
        BigDecimal advance = totalAdvance != null ? totalAdvance : BigDecimal.ZERO;
        BigDecimal finalSalary = calculated.subtract(advance).setScale(2, RoundingMode.HALF_UP);
        return new Result(calculated, finalSalary, validOt);
    }
}
