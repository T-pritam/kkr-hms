package tech.pritamrao.kkrhms.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * Mirrors the original app's token scheme (jose, HS256): claims
 * {@code userId, email, role, type} with a short-lived access token and a
 * longer-lived refresh token, signed with the shared {@code JWT_SECRET} so
 * tokens stay compatible across the migration.
 */
@Service
public class JwtService {

    public enum TokenType { ACCESS, REFRESH }

    private final SecretKey key;
    private final long accessTtlSeconds;
    private final long refreshTtlSeconds;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.access-token-ttl-seconds}") long accessTtlSeconds,
            @Value("${app.jwt.refresh-token-ttl-seconds}") long refreshTtlSeconds) {
        // Match jose's `new TextEncoder().encode(secret)` — UTF-8 bytes of the raw string.
        this.key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        this.accessTtlSeconds = accessTtlSeconds;
        this.refreshTtlSeconds = refreshTtlSeconds;
    }

    public long getAccessTtlSeconds() {
        return accessTtlSeconds;
    }

    public long getRefreshTtlSeconds() {
        return refreshTtlSeconds;
    }

    public String generateAccessToken(UUID userId, String email, Role role) {
        return build(userId, email, role, TokenType.ACCESS, accessTtlSeconds);
    }

    public String generateRefreshToken(UUID userId, String email, Role role) {
        return build(userId, email, role, TokenType.REFRESH, refreshTtlSeconds);
    }

    private String build(UUID userId, String email, Role role, TokenType type, long ttlSeconds) {
        Instant now = Instant.now();
        return Jwts.builder()
                .claim("userId", userId.toString())
                .claim("email", email)
                .claim("role", role.name())
                .claim("type", type == TokenType.ACCESS ? "access" : "refresh")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(key)
                .compact();
    }

    /** Returns the parsed payload, or {@code null} when the token is invalid/expired. */
    public TokenPayload parse(String token) {
        try {
            Claims claims = Jwts.parser().verifyWith(key).build()
                    .parseSignedClaims(token).getPayload();
            UUID userId = UUID.fromString(claims.get("userId", String.class));
            String email = claims.get("email", String.class);
            Role role = Role.from(claims.get("role", String.class));
            String typeRaw = claims.get("type", String.class);
            TokenType type = "refresh".equals(typeRaw) ? TokenType.REFRESH : TokenType.ACCESS;
            if (role == null) return null;
            return new TokenPayload(userId, email, role, type);
        } catch (JwtException | IllegalArgumentException ex) {
            return null;
        }
    }

    public record TokenPayload(UUID userId, String email, Role role, TokenType type) {}
}
