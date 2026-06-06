package tech.pritamrao.kkrhms.controller;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import tech.pritamrao.kkrhms.security.AuthUser;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/patients/{patientId}/consultations")
public class PatientConsultationController {

    private final PatientConsultationRepository consultationRepository;
    private final PatientRepository patientRepository;
    private final DoctorRepository doctorRepository;
    private final UserRepository userRepository;
    private final DoctorVisitSettlementRepository settlementRepository;

    public PatientConsultationController(PatientConsultationRepository consultationRepository,
                                         PatientRepository patientRepository,
                                         DoctorRepository doctorRepository,
                                         UserRepository userRepository,
                                         DoctorVisitSettlementRepository settlementRepository) {
        this.consultationRepository = consultationRepository;
        this.patientRepository = patientRepository;
        this.doctorRepository = doctorRepository;
        this.userRepository = userRepository;
        this.settlementRepository = settlementRepository;
    }

    public record ConsultationView(UUID id, UUID patientId, UUID doctorId, Instant consultationDate,
                                   Integer visitNumber, String notes, UUID billingId, UUID createdBy,
                                   Instant createdAt, Instant updatedAt,
                                   DoctorDtos.DoctorBrief doctor, UserBrief createdByUser) {}

    public record ConsultationRequest(UUID doctorId, Instant consultationDate, String notes, UUID billingId) {}

    @GetMapping
    public List<ConsultationView> list(@PathVariable UUID patientId) {
        return consultationRepository.findByPatientIdAndDeletedAtIsNullOrderByConsultationDateDesc(patientId)
                .stream().map(this::toView).toList();
    }

    @PostMapping
    public ConsultationView create(@PathVariable UUID patientId, @RequestBody ConsultationRequest req,
                                   @AuthenticationPrincipal AuthUser user) {
        if (req.doctorId() == null && (req.notes() == null || req.notes().isBlank())) {
            throw ApiException.badRequest("At least doctor_id or notes must be provided");
        }
        Patient patient = patientRepository.findById(patientId)
                .orElseThrow(() -> ApiException.notFound("Patient not found"));

        Instant when = req.consultationDate() != null ? req.consultationDate() : Instant.now();
        if (patient.getDateOfJoin() != null && when.atZone(java.time.ZoneOffset.UTC).toLocalDate()
                .isBefore(patient.getDateOfJoin())) {
            throw ApiException.badRequest("Consultation date cannot be before patient join date");
        }

        int visitNumber = 1;
        if (req.doctorId() != null) {
            visitNumber = (int) consultationRepository
                    .countByPatientIdAndDoctorIdAndDeletedAtIsNull(patientId, req.doctorId()) + 1;
        }

        PatientConsultation c = new PatientConsultation();
        c.setPatientId(patientId);
        c.setDoctorId(req.doctorId());
        c.setConsultationDate(when);
        c.setVisitNumber(visitNumber);
        c.setNotes(req.notes());
        c.setBillingId(req.billingId());
        c.setCreatedBy(user.id());
        return toView(consultationRepository.save(c));
    }

    @PatchMapping("/{consultationId}")
    public ConsultationView update(@PathVariable UUID patientId, @PathVariable UUID consultationId,
                                   @RequestBody ConsultationRequest req, @AuthenticationPrincipal AuthUser user) {
        PatientConsultation c = consultationRepository.findById(consultationId)
                .filter(x -> x.getPatientId().equals(patientId))
                .orElseThrow(() -> ApiException.notFound("Consultation not found"));
        if (!user.isAdmin() && !user.id().equals(c.getCreatedBy())) {
            throw ApiException.forbidden("You do not have permission to edit this consultation");
        }
        if (req.doctorId() != null) c.setDoctorId(req.doctorId());
        c.setNotes(req.notes());
        if (req.billingId() != null) c.setBillingId(req.billingId());
        if (req.consultationDate() != null) c.setConsultationDate(req.consultationDate());
        c.setUpdatedBy(user.id());
        return toView(consultationRepository.save(c));
    }

    @DeleteMapping("/{consultationId}")
    public Map<String, Object> delete(@PathVariable UUID patientId, @PathVariable UUID consultationId,
                                      @AuthenticationPrincipal AuthUser user) {
        PatientConsultation c = consultationRepository.findById(consultationId)
                .filter(x -> x.getPatientId().equals(patientId))
                .orElseThrow(() -> ApiException.notFound("Consultation not found"));
        if (!user.isAdmin() && !user.id().equals(c.getCreatedBy())) {
            throw ApiException.forbidden("You do not have permission to delete this consultation");
        }
        if (c.getDoctorId() != null) {
            boolean settled = !settlementRepository
                    .findByDoctorIdAndPatientIdAndSettledTrueAndDeletedAtIsNull(c.getDoctorId(), patientId).isEmpty();
            if (settled) {
                throw ApiException.conflict("Cannot delete consultation with settled fees");
            }
        }
        c.setDeletedAt(Instant.now());
        consultationRepository.save(c);
        return Map.of("success", true, "message", "Consultation deleted successfully");
    }

    private ConsultationView toView(PatientConsultation c) {
        Doctor doctor = c.getDoctorId() == null ? null : doctorRepository.findById(c.getDoctorId()).orElse(null);
        UserBrief creator = c.getCreatedBy() == null ? null
                : userRepository.findById(c.getCreatedBy()).map(UserBrief::of).orElse(null);
        return new ConsultationView(c.getId(), c.getPatientId(), c.getDoctorId(), c.getConsultationDate(),
                c.getVisitNumber(), c.getNotes(), c.getBillingId(), c.getCreatedBy(), c.getCreatedAt(),
                c.getUpdatedAt(), DoctorDtos.DoctorBrief.of(doctor), creator);
    }
}
