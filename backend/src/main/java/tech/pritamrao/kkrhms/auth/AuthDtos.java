package tech.pritamrao.kkrhms.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

/** Request/response payloads for the auth endpoints. */
public final class AuthDtos {

    private AuthDtos() {}

    public record LoginRequest(
            @NotBlank(message = "Email and password are required") String email,
            @NotBlank(message = "Email and password are required") String password) {}

    public record UserView(UUID id, String email, String username, String role) {}

    public record LoginResponse(boolean success, boolean needsPasswordChange, UserView user) {}

    public record MeResponse(UserView user) {}

    public record ChangePasswordRequest(String newPassword, String token, Boolean check) {}

    public record ResetPasswordRequest(@Email String email) {}
}
