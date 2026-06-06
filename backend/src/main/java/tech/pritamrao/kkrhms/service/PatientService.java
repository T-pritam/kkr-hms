package tech.pritamrao.kkrhms.service;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class PatientService {

    private final PatientRepository patientRepository;
    private final PatientBillingRepository billingRepository;

    public PatientService(PatientRepository patientRepository, PatientBillingRepository billingRepository) {
        this.patientRepository = patientRepository;
        this.billingRepository = billingRepository;
    }

    public Page<Patient> list(int page, int pageSize, String search) {
        return patientRepository.search(search, PageRequest.of(Math.max(page - 1, 0), pageSize));
    }

    public List<PatientDtos.PatientOption> activePatients() {
        return patientRepository.findByStatusNotIgnoreCaseOrderByNameAsc("discharge").stream()
                .map(p -> new PatientDtos.PatientOption(p.getId(), p.getPatientId(), p.getName()))
                .toList();
    }

    public Patient get(UUID id) {
        return patientRepository.findById(id).orElseThrow(() -> ApiException.notFound("Patient not found"));
    }

    @Transactional
    public void create(PatientDtos.PatientRequest req, UUID userId) {
        if (isBlank(req.patientId()) || isBlank(req.name())) {
            throw ApiException.badRequest("Patient ID and name are required");
        }
        if (patientRepository.existsByPatientId(req.patientId())) {
            throw ApiException.badRequest("Patient ID already exists");
        }
        Patient patient = new Patient();
        apply(patient, req);
        if (patient.getDateOfJoin() == null) patient.setDateOfJoin(LocalDate.now());
        if (patient.getGender() == null) patient.setGender("Male");
        patient.setStatus("Active");
        Patient saved = patientRepository.save(patient);

        // Mirror the original: every new patient gets a billing record.
        PatientBilling billing = new PatientBilling();
        billing.setPatientId(saved.getId());
        billing.setBaseCharge(BigDecimal.ZERO);
        billing.setTotalDoctorFees(BigDecimal.ZERO);
        billing.setPatientChargesTotal(BigDecimal.ZERO);
        billing.setPatientPaidAmount(BigDecimal.ZERO);
        billing.setBillingStatus("pending");
        billing.setReferralSettled(false);
        billing.setCreatedBy(userId);
        billingRepository.save(billing);
    }

    @Transactional
    public void update(UUID id, PatientDtos.PatientRequest req) {
        if (isBlank(req.patientId()) || isBlank(req.name())) {
            throw ApiException.badRequest("Patient ID and name are required");
        }
        if (patientRepository.existsByPatientIdAndIdNot(req.patientId(), id)) {
            throw ApiException.badRequest("Patient ID already exists");
        }
        Patient patient = get(id);
        apply(patient, req);
        if (patient.getGender() == null) patient.setGender("Male");
        if (req.status() != null) patient.setStatus(req.status());
        else patient.setStatus("Active");
        patientRepository.save(patient);
    }

    @Transactional
    public void patch(UUID id, PatientDtos.PatientPatchRequest req) {
        Patient patient = get(id);
        boolean any = false;
        if (req.status() != null) { patient.setStatus(req.status()); any = true; }
        if (req.phone() != null) { patient.setPhone(req.phone()); any = true; }
        if (req.address() != null) { patient.setAddress(req.address()); any = true; }
        if (req.medicalHistory() != null) { patient.setMedicalHistory(req.medicalHistory()); any = true; }
        if (req.allergies() != null) { patient.setAllergies(req.allergies()); any = true; }
        if (req.currentMedications() != null) { patient.setCurrentMedications(req.currentMedications()); any = true; }
        if (req.emergencyContactName() != null) { patient.setEmergencyContactName(req.emergencyContactName()); any = true; }
        if (req.emergencyContactPhone() != null) { patient.setEmergencyContactPhone(req.emergencyContactPhone()); any = true; }
        if (!any) throw ApiException.badRequest("No fields to update");
        patientRepository.save(patient);
    }

    @Transactional
    public void delete(UUID id) {
        patientRepository.deleteById(id);
    }

    private void apply(Patient p, PatientDtos.PatientRequest req) {
        p.setPatientId(req.patientId());
        p.setName(req.name());
        p.setPhone(req.phone());
        p.setGender(req.gender());
        p.setDateOfBirth(req.dateOfBirth());
        p.setDateOfJoin(req.dateOfJoin());
        p.setAddress(req.address());
        p.setReferredBy(req.referredBy());
        p.setEmergencyContactName(req.emergencyContactName());
        p.setEmergencyContactPhone(req.emergencyContactPhone());
        p.setMedicalHistory(req.medicalHistory());
        p.setAllergies(req.allergies());
        p.setCurrentMedications(req.currentMedications());
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
