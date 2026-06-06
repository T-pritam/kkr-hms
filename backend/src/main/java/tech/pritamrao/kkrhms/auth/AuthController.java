package tech.pritamrao.kkrhms.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tech.pritamrao.kkrhms.security.AuthUser;
import tech.pritamrao.kkrhms.security.CookieService;
import tech.pritamrao.kkrhms.security.JwtService;

import java.util.Map;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;
    private final CookieService cookieService;
    private final JwtService jwtService;

    public AuthController(AuthService authService, CookieService cookieService, JwtService jwtService) {
        this.authService = authService;
        this.cookieService = cookieService;
        this.jwtService = jwtService;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody AuthDtos.LoginRequest request) {
        AuthService.LoginResult result = authService.login(request.email(), request.password());
        HttpHeaders headers = cookieHeaders(result.tokens());
        AuthDtos.UserView u = result.user();
        // Verbatim keys (incl. camelCase needsPasswordChange) to match the original login response.
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("success", true);
        body.put("needsPasswordChange", result.needsPasswordChange());
        body.put("user", Map.of("id", u.id(), "email", u.email(), "username", u.username(), "role", u.role()));
        return ResponseEntity.ok().headers(headers).body(body);
    }

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, Object>> refresh(HttpServletRequest request) {
        String refreshToken = CookieService.readCookie(request, CookieService.REFRESH_COOKIE);
        AuthService.TokenPair tokens = authService.refresh(refreshToken);
        return ResponseEntity.ok().headers(cookieHeaders(tokens)).body(Map.of("success", true));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(HttpServletResponse response) {
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.SET_COOKIE, cookieService.clear(CookieService.ACCESS_COOKIE).toString());
        headers.add(HttpHeaders.SET_COOKIE, cookieService.clear(CookieService.REFRESH_COOKIE).toString());
        return ResponseEntity.ok().headers(headers).body(Map.of("success", true));
    }

    @GetMapping("/me")
    public AuthDtos.MeResponse me(@AuthenticationPrincipal AuthUser user) {
        return new AuthDtos.MeResponse(
                new AuthDtos.UserView(user.id(), user.email(), null, user.role().name()));
    }

    @PostMapping("/change-password")
    public Map<String, Object> changePassword(@RequestBody AuthDtos.ChangePasswordRequest request,
                                              @AuthenticationPrincipal AuthUser user) {
        boolean checkOnly = Boolean.TRUE.equals(request.check());
        authService.changePassword(request.newPassword(), request.token(), checkOnly,
                user != null ? user.id() : null);
        if (checkOnly) {
            return Map.of("success", true, "message", "Token is valid");
        }
        return Map.of("success", true);
    }

    @PostMapping("/reset-password")
    public Map<String, Object> resetPassword(@RequestBody AuthDtos.ResetPasswordRequest request) {
        if (request.email() == null || request.email().isBlank()) {
            return Map.of("success", true);
        }
        authService.requestPasswordReset(request.email());
        return Map.of("success", true);
    }

    private HttpHeaders cookieHeaders(AuthService.TokenPair tokens) {
        ResponseCookie access = cookieService.accessCookie(tokens.accessToken(), jwtService.getAccessTtlSeconds());
        ResponseCookie refresh = cookieService.refreshCookie(tokens.refreshToken(), jwtService.getRefreshTtlSeconds());
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.SET_COOKIE, access.toString());
        headers.add(HttpHeaders.SET_COOKIE, refresh.toString());
        return headers;
    }
}
