package tech.pritamrao.kkrhms.users;

import java.time.Instant;
import java.util.UUID;

public final class UserAdminDtos {

    private UserAdminDtos() {}

    public record UserView(UUID id, String username, String email, String role,
                           String status, Instant lastLogin, Instant createdAt) {
        static UserView of(User u) {
            return new UserView(u.getId(), u.getUsername(), u.getEmail(), u.getRole(),
                    u.getStatus(), u.getLastLogin(), u.getCreatedAt());
        }
    }

    public record CreateUserRequest(String username, String email, String password, String role, String status) {}

    public record UpdateUserRequest(String username, String email, String role, String status) {}
}
