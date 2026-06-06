package tech.pritamrao.kkrhms.dto;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import java.util.UUID;

/** Embedded user form used in joined responses ({@code created_by_user:{...}}). */
public record UserBrief(UUID id, String username, String email) {
    public static UserBrief of(User u) {
        return u == null ? null : new UserBrief(u.getId(), u.getUsername(), u.getEmail());
    }
}
