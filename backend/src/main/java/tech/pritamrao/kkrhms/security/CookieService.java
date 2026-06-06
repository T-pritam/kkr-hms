package tech.pritamrao.kkrhms.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * Builds the httpOnly {@code accessToken}/{@code refreshToken} cookies. In
 * production both apps share a parent domain, so cookies are scoped to it
 * (e.g. {@code .pritamrao.tech}); in local dev the domain is left unset.
 */
@Service
public class CookieService {

    public static final String ACCESS_COOKIE = "accessToken";
    public static final String REFRESH_COOKIE = "refreshToken";

    private final String domain;
    private final boolean secure;
    private final String sameSite;

    public CookieService(
            @Value("${app.cookies.domain:}") String domain,
            @Value("${app.cookies.secure:false}") boolean secure,
            @Value("${app.cookies.same-site:Lax}") String sameSite) {
        this.domain = domain;
        this.secure = secure;
        this.sameSite = sameSite;
    }

    public ResponseCookie accessCookie(String token, long maxAgeSeconds) {
        return build(ACCESS_COOKIE, token, maxAgeSeconds);
    }

    public ResponseCookie refreshCookie(String token, long maxAgeSeconds) {
        return build(REFRESH_COOKIE, token, maxAgeSeconds);
    }

    public ResponseCookie clear(String name) {
        return build(name, "", 0);
    }

    private ResponseCookie build(String name, String value, long maxAgeSeconds) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite(sameSite)
                .path("/")
                .maxAge(maxAgeSeconds);
        if (StringUtils.hasText(domain)) {
            builder.domain(domain);
        }
        return builder.build();
    }

    public static String readCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (var cookie : request.getCookies()) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
