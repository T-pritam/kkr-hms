package tech.pritamrao.kkrhms.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Authenticates each request from the {@code accessToken} cookie (also accepts a
 * Bearer header as a convenience for tooling). Only access tokens are honoured;
 * refresh happens via the explicit {@code /auth/refresh} endpoint.
 */
@Component
public class JwtCookieFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    public JwtCookieFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        String token = CookieService.readCookie(request, CookieService.ACCESS_COOKIE);
        if (token == null) {
            String header = request.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer ")) {
                token = header.substring(7);
            }
        }

        if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            JwtService.TokenPayload payload = jwtService.parse(token);
            if (payload != null && payload.type() == JwtService.TokenType.ACCESS) {
                AuthUser principal = new AuthUser(payload.userId(), payload.email(), payload.role());
                var authentication = new UsernamePasswordAuthenticationToken(
                        principal, null, List.of(new SimpleGrantedAuthority(payload.role().authority())));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        }

        filterChain.doFilter(request, response);
    }
}
