package tech.pritamrao.kkrhms.finances;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExpenseRepository extends JpaRepository<Expense, Long> {

    List<Expense> findByMonthYearOrderByExpenseDateDesc(String monthYear);

    List<Expense> findByMonthYear(String monthYear);
}
