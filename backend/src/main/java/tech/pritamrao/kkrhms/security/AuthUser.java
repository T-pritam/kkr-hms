package tech.pritamrao.kkrhms.security;

import java.util.UUID;

/**
 * The authenticated principal placed on the security context for the duration
 * of a request. Resolved from the access-token cookie by {@link JwtCookieFilter}
 * and injected into controllers via {@code @AuthenticationPrincipal}.
 */
public record AuthUser(UUID id, String email, Role role) {

    public boolean isAdmin() {
        return role == Role.ADMIN;
    }

    public boolean isAdminOrDoctor() {
        return role == Role.ADMIN || role == Role.DOCTOR;
    }
}
