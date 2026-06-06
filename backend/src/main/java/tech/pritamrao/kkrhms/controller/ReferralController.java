package tech.pritamrao.kkrhms.controller;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import tech.pritamrao.kkrhms.security.AuthUser;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/referrals")
public class ReferralController {

    private final ReferralRepository repository;

    public ReferralController(ReferralRepository repository) {
        this.repository = repository;
    }

    public record ReferralView(java.util.UUID id, String name, String phone, String status, java.time.Instant createdAt) {}
    public record CreateReferralRequest(String name, String phone) {}

    @GetMapping
    public List<ReferralView> list() {
        return repository.findAllByOrderByNameAsc().stream()
                .map(r -> new ReferralView(r.getId(), r.getName(), r.getPhone(), r.getStatus(), r.getCreatedAt()))
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReferralView create(@RequestBody CreateReferralRequest req, @AuthenticationPrincipal AuthUser user) {
        if (req.name() == null || req.name().isBlank()) {
            throw ApiException.badRequest("Referral name is required");
        }
        Referral referral = new Referral();
        referral.setName(req.name());
        referral.setPhone(req.phone());
        referral.setStatus("active");
        referral.setCreatedBy(user.id());
        referral.setUpdatedBy(user.id());
        Referral saved = repository.save(referral);
        return new ReferralView(saved.getId(), saved.getName(), saved.getPhone(), saved.getStatus(), saved.getCreatedAt());
    }
}
