package tech.pritamrao.kkrhms.service;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tech.pritamrao.kkrhms.security.Role;

import java.util.UUID;

@Service
public class UserAdminService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String defaultPassword;

    public UserAdminService(UserRepository userRepository, PasswordEncoder passwordEncoder,
                            @Value("${app.default-password}") String defaultPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.defaultPassword = defaultPassword;
    }

    public Page<User> list(int page, int pageSize, String search) {
        return userRepository.search(search, PageRequest.of(Math.max(page - 1, 0), pageSize));
    }

    @Transactional
    public User create(UserAdminDtos.CreateUserRequest req) {
        if (isBlank(req.username()) || isBlank(req.email()) || isBlank(req.password()) || isBlank(req.role())) {
            throw ApiException.badRequest("Missing required fields");
        }
        if ("ADMIN".equalsIgnoreCase(req.role())) {
            throw ApiException.forbidden("Admin users can only be created by super admin");
        }
        if (Role.from(req.role()) == null) {
            throw ApiException.badRequest("Invalid role");
        }
        if (userRepository.existsByEmail(req.email())) {
            throw ApiException.badRequest("Email already exists");
        }
        User user = new User();
        user.setUsername(req.username());
        user.setEmail(req.email());
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setRole(req.role().toUpperCase());
        user.setStatus(req.status() != null ? req.status() : "ACTIVE");
        user.setNeedsPasswordChange(true);
        return userRepository.save(user);
    }

    @Transactional
    public User update(UUID id, UserAdminDtos.UpdateUserRequest req) {
        User user = userRepository.findById(id).orElseThrow(() -> ApiException.notFound("User not found"));
        if ("ADMIN".equalsIgnoreCase(user.getRole())) {
            throw ApiException.forbidden("Cannot modify admin users");
        }
        if (req.role() != null && "ADMIN".equalsIgnoreCase(req.role())) {
            throw ApiException.forbidden("Cannot change role to admin");
        }
        if (req.username() != null) user.setUsername(req.username());
        if (req.email() != null) user.setEmail(req.email());
        if (req.role() != null) user.setRole(req.role().toUpperCase());
        if (req.status() != null) user.setStatus(req.status());
        return userRepository.save(user);
    }

    @Transactional
    public void delete(UUID id, UUID currentUserId) {
        if (id.equals(currentUserId)) {
            throw ApiException.badRequest("Cannot delete your own account");
        }
        User user = userRepository.findById(id).orElseThrow(() -> ApiException.notFound("User not found"));
        if ("ADMIN".equalsIgnoreCase(user.getRole())) {
            throw ApiException.forbidden("Cannot delete admin users");
        }
        userRepository.delete(user);
    }

    @Transactional
    public void resetPassword(UUID id) {
        User user = userRepository.findById(id).orElseThrow(() -> ApiException.notFound("User not found"));
        user.setPasswordHash(passwordEncoder.encode(defaultPassword));
        user.setNeedsPasswordChange(true);
        userRepository.save(user);
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
