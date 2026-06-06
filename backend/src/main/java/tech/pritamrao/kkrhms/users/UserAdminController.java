package tech.pritamrao.kkrhms.users;

import org.springframework.data.domain.Page;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tech.pritamrao.kkrhms.security.AuthUser;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class UserAdminController {

    private final UserAdminService service;

    public UserAdminController(UserAdminService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "10") int pageSize,
                                    @RequestParam(defaultValue = "") String search) {
        Page<User> result = service.list(page, pageSize, search);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("users", result.getContent().stream().map(UserAdminDtos.UserView::of).toList());
        body.put("total", result.getTotalElements());
        body.put("page", page);
        body.put("pageSize", pageSize);
        body.put("totalPages", result.getTotalPages());
        return body;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody UserAdminDtos.CreateUserRequest req) {
        User user = service.create(req);
        return Map.of("success", true, "user", Map.of(
                "id", user.getId(), "username", user.getUsername(), "email", user.getEmail(),
                "role", user.getRole(), "status", user.getStatus()));
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody UserAdminDtos.UpdateUserRequest req) {
        return Map.of("success", true, "user", UserAdminDtos.UserView.of(service.update(id, req)));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> patch(@PathVariable UUID id, @RequestBody UserAdminDtos.UpdateUserRequest req) {
        return Map.of("success", true, "user", UserAdminDtos.UserView.of(service.update(id, req)));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable UUID id, @AuthenticationPrincipal AuthUser current) {
        service.delete(id, current.id());
        return Map.of("success", true);
    }

    @PostMapping("/{id}/reset-password")
    public Map<String, Object> resetPassword(@PathVariable UUID id) {
        service.resetPassword(id);
        return Map.of("success", true, "message", "Password reset to default. User must change on next login.");
    }
}
