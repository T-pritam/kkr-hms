package tech.pritamrao.kkrhms.dto;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import java.time.Instant;
import java.util.UUID;

public final class UserAdminDtos {

    private UserAdminDtos() {}

    public record UserView(UUID id, String username, String email, String role,
                           String status, Instant lastLogin, Instant createdAt) {
        public static UserView of(User u) {
            return new UserView(u.getId(), u.getUsername(), u.getEmail(), u.getRole(),
                    u.getStatus(), u.getLastLogin(), u.getCreatedAt());
        }
    }

    public record CreateUserRequest(String username, String email, String password, String role, String status) {}

    public record UpdateUserRequest(String username, String email, String role, String status) {}
}
