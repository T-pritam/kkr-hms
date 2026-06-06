package tech.pritamrao.kkrhms.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

/**
 * Cloudflare R2 is S3-compatible; we point the AWS SDK at the R2 endpoint with
 * path-style access and the "auto" region.
 */
@Configuration
public class R2Config {

    private final String accountId;
    private final String accessKeyId;
    private final String secretAccessKey;

    public R2Config(
            @Value("${app.r2.account-id}") String accountId,
            @Value("${app.r2.access-key-id}") String accessKeyId,
            @Value("${app.r2.secret-access-key}") String secretAccessKey) {
        this.accountId = accountId;
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
    }

    private URI endpoint() {
        return URI.create("https://" + accountId + ".r2.cloudflarestorage.com");
    }

    private StaticCredentialsProvider credentials() {
        return StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey));
    }

    @Bean
    public S3Client r2S3Client() {
        return S3Client.builder()
                .endpointOverride(endpoint())
                .region(Region.of("auto"))
                .credentialsProvider(credentials())
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }

    @Bean
    public S3Presigner r2S3Presigner() {
        return S3Presigner.builder()
                .endpointOverride(endpoint())
                .region(Region.of("auto"))
                .credentialsProvider(credentials())
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }
}
