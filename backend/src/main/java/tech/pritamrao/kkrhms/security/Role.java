package tech.pritamrao.kkrhms.security;

/**
 * The four roles the HMS recognises. Stored uppercase in {@code users.role} and
 * carried verbatim in the JWT {@code role} claim.
 */
public enum Role {
    ADMIN,
    DOCTOR,
    NURSE,
    RECEPTIONIST;

    public static Role from(String value) {
        if (value == null) return null;
        try {
            return Role.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    /** Spring Security authority form, e.g. {@code ROLE_ADMIN}. */
    public String authority() {
        return "ROLE_" + name();
    }
}
