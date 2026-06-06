package tech.pritamrao.kkrhms.patients;

import java.util.UUID;

/** Embedded patient form used in joined responses ({@code patient:{...}}). */
public record PatientBrief(UUID id, String patientId, String name) {
    public static PatientBrief of(Patient p) {
        return p == null ? null : new PatientBrief(p.getId(), p.getPatientId(), p.getName());
    }
}
