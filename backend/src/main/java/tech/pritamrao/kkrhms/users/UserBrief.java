package tech.pritamrao.kkrhms.users;

import java.util.UUID;

/** Embedded user form used in joined responses ({@code created_by_user:{...}}). */
public record UserBrief(UUID id, String username, String email) {
    public static UserBrief of(User u) {
        return u == null ? null : new UserBrief(u.getId(), u.getUsername(), u.getEmail());
    }
}
