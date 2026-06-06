package tech.pritamrao.kkrhms.referrals;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ReferralRepository extends JpaRepository<Referral, UUID> {
    List<Referral> findAllByOrderByNameAsc();
}
