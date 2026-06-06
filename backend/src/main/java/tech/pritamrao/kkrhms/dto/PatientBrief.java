package tech.pritamrao.kkrhms.dto;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import java.util.UUID;

/** Embedded patient form used in joined responses ({@code patient:{...}}). */
public record PatientBrief(UUID id, String patientId, String name) {
    public static PatientBrief of(Patient p) {
        return p == null ? null : new PatientBrief(p.getId(), p.getPatientId(), p.getName());
    }
}
