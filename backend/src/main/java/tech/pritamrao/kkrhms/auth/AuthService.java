package tech.pritamrao.kkrhms.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.pritamrao.kkrhms.common.ApiException;
import tech.pritamrao.kkrhms.common.Hashing;
import tech.pritamrao.kkrhms.email.BrevoEmailService;
import tech.pritamrao.kkrhms.security.JwtService;
import tech.pritamrao.kkrhms.security.Role;
import tech.pritamrao.kkrhms.users.User;
import tech.pritamrao.kkrhms.users.UserRepository;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository resetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final BrevoEmailService emailService;
    private final String frontendUrl;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(UserRepository userRepository,
                       PasswordResetTokenRepository resetTokenRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       BrevoEmailService emailService,
                       @Value("${app.frontend-url}") String frontendUrl) {
        this.userRepository = userRepository;
        this.resetTokenRepository = resetTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.emailService = emailService;
        this.frontendUrl = frontendUrl;
    }

    public record TokenPair(String accessToken, String refreshToken) {}

    public record LoginResult(AuthDtos.UserView user, boolean needsPasswordChange, TokenPair tokens) {}

    @Transactional
    public LoginResult login(String email, String password) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> ApiException.unauthorized("Invalid credentials"));

        if (!"ACTIVE".equalsIgnoreCase(user.getStatus())) {
            throw ApiException.forbidden("Account is inactive. Please contact administrator.");
        }
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw ApiException.unauthorized("Invalid credentials");
        }

        Role role = Role.from(user.getRole());
        if (role == null) {
            throw ApiException.forbidden("Account role is not recognised.");
        }

        TokenPair tokens = issueTokens(user.getId(), user.getEmail(), role);
        user.setLastLogin(Instant.now());
        userRepository.save(user);

        var view = new AuthDtos.UserView(user.getId(), user.getEmail(), user.getUsername(), role.name());
        return new LoginResult(view, Boolean.TRUE.equals(user.getNeedsPasswordChange()), tokens);
    }

    /** Validates the refresh token and rotates both tokens. */
    public TokenPair refresh(String refreshToken) {
        if (refreshToken == null) {
            throw ApiException.unauthorized("Unauthorized");
        }
        JwtService.TokenPayload payload = jwtService.parse(refreshToken);
        if (payload == null || payload.type() != JwtService.TokenType.REFRESH) {
            throw ApiException.unauthorized("Unauthorized");
        }
        return issueTokens(payload.userId(), payload.email(), payload.role());
    }

    private TokenPair issueTokens(UUID userId, String email, Role role) {
        return new TokenPair(
                jwtService.generateAccessToken(userId, email, role),
                jwtService.generateRefreshToken(userId, email, role));
    }

    @Transactional
    public void changePassword(String newPassword, String token, boolean checkOnly, UUID loggedInUserId) {
        if (newPassword == null && !checkOnly) {
            throw ApiException.badRequest("New password is required");
        }
        if (!checkOnly && newPassword.length() < 8) {
            throw ApiException.badRequest("Password must be at least 8 characters long");
        }

        UUID userId;
        PasswordResetToken resetToken = null;

        if (token != null && !token.isBlank()) {
            String tokenHash = Hashing.sha256Hex(token);
            resetToken = resetTokenRepository.findByTokenHash(tokenHash)
                    .orElseThrow(() -> ApiException.badRequest("Invalid reset token"));
            if (resetToken.getExpiresAt().isBefore(Instant.now())) {
                throw ApiException.badRequest("Reset Link has expired. Please generate a new one.");
            }
            if (Boolean.TRUE.equals(resetToken.getIsUsed())) {
                throw ApiException.badRequest("Reset token has already been used");
            }
            if (checkOnly) {
                return; // token is valid
            }
            userId = resetToken.getUserId();
        } else {
            if (loggedInUserId == null) {
                throw ApiException.unauthorized("Unauthorized");
            }
            userId = loggedInUserId;
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setNeedsPasswordChange(false);
        user.setResetToken(null);
        user.setResetTokenExpiry(null);
        userRepository.save(user);

        if (resetToken != null) {
            resetToken.setIsUsed(true);
            resetToken.setUsedAt(Instant.now());
            resetTokenRepository.save(resetToken);
        }
    }

    /** Always succeeds outwardly — never reveals whether the email exists. */
    @Transactional
    public void requestPasswordReset(String email) {
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            return;
        }
        User user = userOpt.get();

        byte[] raw = new byte[32];
        secureRandom.nextBytes(raw);
        String token = HexFormat.of().formatHex(raw);

        PasswordResetToken entity = new PasswordResetToken();
        entity.setUserId(user.getId());
        entity.setTokenHash(Hashing.sha256Hex(token));
        entity.setExpiresAt(Instant.now().plusSeconds(3600));
        entity.setIsUsed(false);
        resetTokenRepository.save(entity);

        String resetUrl = frontendUrl + "/change-password?token=" + token;
        emailService.sendPasswordReset(user.getEmail(), user.getUsername(), resetUrl);
    }
}
