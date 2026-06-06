package tech.pritamrao.kkrhms.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Replaces the Supabase {@code send-reset-email} edge function: sends the
 * password-reset email through Brevo's transactional API, preserving the
 * original subject and branded HTML template.
 */
@Service
public class BrevoEmailService {

    private static final Logger log = LoggerFactory.getLogger(BrevoEmailService.class);
    private static final String BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

    private final RestClient restClient;
    private final String apiKey;
    private final String senderEmail;
    private final String senderName;

    public BrevoEmailService(
            @Value("${app.brevo.api-key:}") String apiKey,
            @Value("${app.brevo.sender-email}") String senderEmail,
            @Value("${app.brevo.sender-name}") String senderName) {
        this.apiKey = apiKey;
        this.senderEmail = senderEmail;
        this.senderName = senderName;
        this.restClient = RestClient.create();
    }

    public void sendPasswordReset(String email, String username, String resetUrl) {
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("BREVO_API_KEY not configured; skipping password-reset email to {}", email);
            return;
        }

        Map<String, Object> payload = Map.of(
                "sender", Map.of("name", senderName, "email", senderEmail),
                "to", List.of(Map.of("email", email, "name", username != null ? username : email)),
                "subject", "Password Reset Request - KKR Hospital",
                "htmlContent", htmlTemplate(username, resetUrl)
        );

        try {
            restClient.post()
                    .uri(BREVO_API_URL)
                    .header("api-key", apiKey)
                    .header("accept", "application/json")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            // Never reveal failures to the caller (avoids leaking whether the user exists).
            log.error("Brevo email send failed for {}: {}", email, e.getMessage());
        }
    }

    private String htmlTemplate(String username, String resetUrl) {
        String name = username != null ? username : "User";
        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Password Reset</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #ea580c 0%%, #c2410c 100%%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px;">KKR Hospital</h1>
                <p style="color: #fed7aa; margin: 10px 0 0 0;">Hospital Management System</p>
              </div>
              <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
                <h2 style="color: #1f2937; margin-top: 0;">Password Reset Request</h2>
                <p style="color: #4b5563; font-size: 16px;">Hello %s,</p>
                <p style="color: #4b5563; font-size: 16px;">We received a request to reset your password for your KKR Hospital Management System account.</p>
                <p style="color: #4b5563; font-size: 16px;">Click the button below to reset your password:</p>
                <div style="text-align: center; margin: 35px 0;">
                  <a href="%s" style="background: #ea580c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Reset Password</a>
                </div>
                <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
                <p style="color: #ea580c; font-size: 14px; word-break: break-all; background: #fef3c7; padding: 12px; border-radius: 6px; border-left: 4px solid #ea580c;">%s</p>
                <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">This link will expire in 1 hour for security reasons.</p>
                <p style="color: #6b7280; font-size: 14px;">If you didn't request this password reset, please ignore this email or contact your administrator.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">This is an automated email from KKR Hospital Management System.<br>Please do not reply to this email.</p>
              </div>
            </body>
            </html>
            """.formatted(name, resetUrl, resetUrl);
    }
}
