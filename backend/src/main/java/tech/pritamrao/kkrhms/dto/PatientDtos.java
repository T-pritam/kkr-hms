package tech.pritamrao.kkrhms.dto;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class PatientDtos {

    private PatientDtos() {}

    public record PatientView(
            UUID id, String patientId, String name, String phone, String gender,
            LocalDate dateOfBirth, LocalDate dateOfJoin, String address, String referredBy,
            String emergencyContactName, String emergencyContactPhone, String medicalHistory,
            String allergies, String currentMedications, String status,
            Instant createdAt, Instant updatedAt) {

        public static PatientView of(Patient p) {
            return new PatientView(p.getId(), p.getPatientId(), p.getName(), p.getPhone(), p.getGender(),
                    p.getDateOfBirth(), p.getDateOfJoin(), p.getAddress(), p.getReferredBy(),
                    p.getEmergencyContactName(), p.getEmergencyContactPhone(), p.getMedicalHistory(),
                    p.getAllergies(), p.getCurrentMedications(), p.getStatus(),
                    p.getCreatedAt(), p.getUpdatedAt());
        }
    }

    public record PatientOption(UUID id, String patientId, String name) {}

    public record PatientRequest(
            String patientId, String name, String phone, String gender,
            LocalDate dateOfBirth, LocalDate dateOfJoin, String address, String referredBy,
            String emergencyContactName, String emergencyContactPhone, String medicalHistory,
            String allergies, String currentMedications, String status) {}

    public record PatientPatchRequest(
            String status, String phone, String address, String medicalHistory, String allergies,
            String currentMedications, String emergencyContactName, String emergencyContactPhone) {}
}
