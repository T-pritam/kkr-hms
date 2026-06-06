package tech.pritamrao.kkrhms.patients;

import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tech.pritamrao.kkrhms.common.ApiException;
import tech.pritamrao.kkrhms.security.AuthUser;
import tech.pritamrao.kkrhms.storage.R2StorageService;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/patients/{patientId}/case-sheets")
public class CaseSheetController {

    private final PatientCaseSheetRepository repository;
    private final R2StorageService storage;

    public CaseSheetController(PatientCaseSheetRepository repository, R2StorageService storage) {
        this.repository = repository;
        this.storage = storage;
    }

    public record CaseSheetView(UUID id, UUID patientId, UUID patientBillingId, LocalDate dischargeDate,
                                String dischargeNotes, String caseSheetUrl, String caseSheetFilename,
                                Instant uploadedAt, UUID createdBy, Instant createdAt, Instant updatedAt) {
        static CaseSheetView of(PatientCaseSheet c) {
            return new CaseSheetView(c.getId(), c.getPatientId(), c.getPatientBillingId(), c.getDischargeDate(),
                    c.getDischargeNotes(), c.getCaseSheetUrl(), c.getCaseSheetFilename(), c.getUploadedAt(),
                    c.getCreatedBy(), c.getCreatedAt(), c.getUpdatedAt());
        }
    }

    public record CreateCaseSheetRequest(UUID patientBillingId, LocalDate dischargeDate, String dischargeNotes,
                                         String caseSheetUrl, String caseSheetFilename) {}

    @GetMapping
    public List<CaseSheetView> list(@PathVariable UUID patientId) {
        return repository.findByPatientIdOrderByCreatedAtDesc(patientId).stream().map(CaseSheetView::of).toList();
    }

    @PostMapping
    public CaseSheetView create(@PathVariable UUID patientId, @RequestBody CreateCaseSheetRequest req,
                                @AuthenticationPrincipal AuthUser user) {
        PatientCaseSheet c = new PatientCaseSheet();
        c.setPatientId(patientId);
        c.setPatientBillingId(req.patientBillingId());
        c.setDischargeDate(req.dischargeDate());
        c.setDischargeNotes(req.dischargeNotes());
        c.setCaseSheetUrl(req.caseSheetUrl());
        c.setCaseSheetFilename(req.caseSheetFilename());
        if (req.caseSheetUrl() != null) c.setUploadedAt(Instant.now());
        c.setCreatedBy(user.id());
        return CaseSheetView.of(repository.save(c));
    }

    /** Uploads the PDF directly to R2 (replaces the upload-case-sheet edge function). */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> upload(@PathVariable UUID patientId, @RequestParam("file") MultipartFile file) {
        R2StorageService.UploadResult result = storage.uploadCaseSheet(patientId, file);
        return Map.of("success", true, "url", result.url(), "filename", result.filename());
    }

    @GetMapping("/{caseSheetId}/download")
    public Map<String, Object> download(@PathVariable UUID patientId, @PathVariable UUID caseSheetId) {
        PatientCaseSheet c = require(patientId, caseSheetId);
        if (c.getCaseSheetUrl() == null) {
            throw ApiException.notFound("No file attached to this case sheet");
        }
        String url = storage.presignDownload(c.getCaseSheetUrl());
        return Map.of("success", true, "downloadUrl", url, "filename", c.getCaseSheetFilename());
    }

    @PatchMapping(value = "/{caseSheetId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CaseSheetView patchWithFile(@PathVariable UUID patientId, @PathVariable UUID caseSheetId,
                                       @RequestParam(value = "file", required = false) MultipartFile file,
                                       @RequestParam(value = "discharge_date", required = false) String dischargeDate,
                                       @RequestParam(value = "discharge_notes", required = false) String dischargeNotes) {
        PatientCaseSheet c = require(patientId, caseSheetId);
        if (dischargeDate != null && !dischargeDate.isBlank()) c.setDischargeDate(LocalDate.parse(dischargeDate));
        if (dischargeNotes != null) c.setDischargeNotes(dischargeNotes);
        if (file != null && !file.isEmpty()) {
            String oldUrl = c.getCaseSheetUrl();
            R2StorageService.UploadResult result = storage.uploadCaseSheet(patientId, file);
            c.setCaseSheetUrl(result.url());
            c.setCaseSheetFilename(result.filename());
            c.setUploadedAt(Instant.now());
            if (oldUrl != null) storage.deleteByUrl(oldUrl);
        }
        return CaseSheetView.of(repository.save(c));
    }

    @PatchMapping(value = "/{caseSheetId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public CaseSheetView patchJson(@PathVariable UUID patientId, @PathVariable UUID caseSheetId,
                                   @RequestBody CreateCaseSheetRequest req) {
        PatientCaseSheet c = require(patientId, caseSheetId);
        if (req.dischargeDate() != null) c.setDischargeDate(req.dischargeDate());
        if (req.dischargeNotes() != null) c.setDischargeNotes(req.dischargeNotes());
        if (req.caseSheetUrl() != null) {
            String oldUrl = c.getCaseSheetUrl();
            c.setCaseSheetUrl(req.caseSheetUrl());
            c.setCaseSheetFilename(req.caseSheetFilename());
            c.setUploadedAt(Instant.now());
            if (oldUrl != null) storage.deleteByUrl(oldUrl);
        }
        return CaseSheetView.of(repository.save(c));
    }

    @DeleteMapping("/{caseSheetId}")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> delete(@PathVariable UUID patientId, @PathVariable UUID caseSheetId) {
        PatientCaseSheet c = require(patientId, caseSheetId);
        if (c.getCaseSheetUrl() != null) storage.deleteByUrl(c.getCaseSheetUrl());
        repository.delete(c);
        return Map.of("message", "Case sheet deleted successfully");
    }

    private PatientCaseSheet require(UUID patientId, UUID caseSheetId) {
        return repository.findByIdAndPatientId(caseSheetId, patientId)
                .orElseThrow(() -> ApiException.notFound("Case sheet not found"));
    }
}
