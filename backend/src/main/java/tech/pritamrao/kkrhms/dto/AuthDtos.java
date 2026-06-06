package tech.pritamrao.kkrhms.dto;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import com.fasterxml.jackson.annotation.JsonProperty;
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

    // The frontend sends camelCase "newPassword"; pin the JSON name so the global
    // snake_case strategy doesn't expect "new_password".
    public record ChangePasswordRequest(@JsonProperty("newPassword") String newPassword, String token, Boolean check) {}

    public record ResetPasswordRequest(@Email String email) {}
}
