package tech.pritamrao.kkrhms.doctors;

import java.time.Instant;
import java.util.UUID;

public final class DoctorDtos {

    private DoctorDtos() {}

    public record DoctorView(UUID id, String name, String mobile, String email,
                             String designation, String specialist, Instant createdAt, Instant updatedAt) {
        public static DoctorView of(Doctor d) {
            return new DoctorView(d.getId(), d.getName(), d.getMobile(), d.getEmail(),
                    d.getDesignation(), d.getSpecialist(), d.getCreatedAt(), d.getUpdatedAt());
        }
    }

    /** Embedded form used inside settlement/consultation responses ({@code doctor:{...}}). */
    public record DoctorBrief(UUID id, String name, String specialist) {
        public static DoctorBrief of(Doctor d) {
            return d == null ? null : new DoctorBrief(d.getId(), d.getName(), d.getSpecialist());
        }
    }

    public record DoctorOption(UUID id, String name, String specialist) {}

    public record DoctorRequest(String name, String mobile, String email, String designation, String specialist) {}
}
