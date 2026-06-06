package tech.pritamrao.kkrhms.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import tech.pritamrao.kkrhms.common.ApiException;

import java.io.IOException;
import java.time.Duration;
import java.util.UUID;

/**
 * Replaces the Supabase {@code upload-case-sheet} edge function and the inline
 * R2 logic from the Next.js routes. Case sheets are PDFs (max 10MB) stored at
 * {@code case-sheets/{patientId}/{timestamp}_{filename}} and served via the R2
 * public bucket; downloads use a 1-hour presigned URL.
 */
@Service
public class R2StorageService {

    private static final Logger log = LoggerFactory.getLogger(R2StorageService.class);
    private static final long MAX_FILE_SIZE = 10L * 1024 * 1024;
    private static final String PREFIX = "case-sheets/";

    private final S3Client s3Client;
    private final S3Presigner presigner;
    private final String bucket;
    private final String accountId;

    public R2StorageService(S3Client s3Client, S3Presigner presigner,
                            @Value("${app.r2.bucket}") String bucket,
                            @Value("${app.r2.account-id}") String accountId) {
        this.s3Client = s3Client;
        this.presigner = presigner;
        this.bucket = bucket;
        this.accountId = accountId;
    }

    public record UploadResult(String url, String filename) {}

    public UploadResult uploadCaseSheet(UUID patientId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("No file provided");
        }
        if (!"application/pdf".equals(file.getContentType())) {
            throw ApiException.badRequest("Only PDF files are allowed");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw ApiException.badRequest("File size must be less than 10MB");
        }

        String safeName = (System.currentTimeMillis() + "_" + originalName(file))
                .replaceAll("[^a-zA-Z0-9._-]", "_");
        String key = PREFIX + patientId + "/" + safeName;

        try {
            s3Client.putObject(
                    PutObjectRequest.builder().bucket(bucket).key(key).contentType("application/pdf").build(),
                    RequestBody.fromBytes(file.getBytes()));
        } catch (IOException e) {
            throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read uploaded file");
        }

        return new UploadResult(publicUrl(key), safeName);
    }

    public String presignDownload(String caseSheetUrl) {
        String key = keyFromUrl(caseSheetUrl);
        if (key == null) {
            throw ApiException.badRequest("Invalid file URL");
        }
        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofHours(1))
                .getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(key).build())
                .build();
        return presigner.presignGetObject(presignRequest).url().toString();
    }

    /** Best-effort delete; never blocks the surrounding operation on failure. */
    public void deleteByUrl(String caseSheetUrl) {
        String key = keyFromUrl(caseSheetUrl);
        if (key == null) return;
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (Exception e) {
            log.warn("Failed to delete R2 object {}: {}", key, e.getMessage());
        }
    }

    private String publicUrl(String key) {
        return "https://pub-" + accountId + ".r2.dev/" + key;
    }

    private String keyFromUrl(String url) {
        if (url == null) return null;
        int idx = url.indexOf("/" + PREFIX);
        if (idx < 0) return null;
        return url.substring(idx + 1); // drop the leading slash, keep "case-sheets/..."
    }

    private String originalName(MultipartFile file) {
        String name = file.getOriginalFilename();
        return name == null || name.isBlank() ? "file.pdf" : name;
    }
}
