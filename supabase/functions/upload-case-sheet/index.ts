import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.645.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.645.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    /* ---------------- AUTH CHECK ---------------- */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    /* ---------------- ENV VARS ---------------- */
    const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID");
    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const R2_BUCKET_NAME =
      Deno.env.get("R2_BUCKET_NAME") || "hms-case-sheets";

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      return new Response(
        JSON.stringify({ error: "R2 credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    /* ---------------- REQUEST BODY ---------------- */
    const { filename, contentType, patientId, fileSize } = await req.json();

    if (!filename || !patientId || !fileSize) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: filename, patientId, fileSize",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate file size - max 10MB
    if (fileSize > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          error: `File size exceeds 10MB limit. Maximum allowed: 10MB, Uploaded: ${(fileSize / 1024 / 1024).toFixed(2)}MB`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate file type
    if (contentType !== "application/pdf") {
      return new Response(
        JSON.stringify({
          error: "Only PDF files are allowed. Uploaded file type: " + contentType,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    /* ---------------- VALIDATIONS ---------------- */
    if (contentType !== "application/pdf") {
      return new Response(
        JSON.stringify({ error: "Only PDF files are allowed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (fileSize > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: "File size exceeds 10MB limit" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    /* ---------------- S3 CLIENT ---------------- */
    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    /* ---------------- FILE PATH ---------------- */
    const timestamp = Date.now();
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");

    const key = `case-sheets/${patientId}/${timestamp}_${safeFilename}`;

    /* ---------------- PRESIGNED URL ---------------- */
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: "application/pdf",
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 60 * 60, // 1 hour
    });

    const publicUrl = `https://pub-${R2_ACCOUNT_ID}.r2.dev/${key}`;

    /* ---------------- RESPONSE ---------------- */
    return new Response(
      JSON.stringify({
        uploadUrl,
        publicUrl,
        key,
        maxSize: MAX_FILE_SIZE,
        contentType: "application/pdf",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("R2 upload URL error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Unknown server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
