/**
 * One-time script: setup CORS cho R2 bucket để browser PUT thẳng được.
 *
 * Chạy: node tools/setup-r2-cors.mjs
 *
 * Cho phép:
 * - http://localhost:3000 (dev)
 * - https://*.vercel.app (production deploy Vercel preview/prod)
 */
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";

// Manual env load (script chạy ngoài Next.js)
const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match && match[2]) {
    process.env[match[1]] = match[2];
  }
}

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("❌ Missing R2 env vars trong .env.local");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const corsConfig = {
  CORSRules: [
    {
      // Cổng dev KHÔNG chỉ có 3000: `next dev` tự nhảy sang 3001/3002 khi 3000
      // bị chiếm. Thiếu cổng đang chạy thì mọi thứ fetch trực tiếp từ R2 ở client
      // đều chết vì CORS — đo 2026-09-07: map trong Dataset card báo "Không tải
      // được bản đồ (Failed to fetch)" trên localhost:3001, trong khi production
      // vẫn bình thường. Lỗi chỉ xuất hiện ở máy dev nên rất dễ tưởng là lỗi khác.
      AllowedOrigins: [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "https://*.vercel.app",
      ],
      AllowedMethods: ["PUT", "GET", "HEAD"],
      AllowedHeaders: ["Content-Type", "x-amz-*", "X-Amz-*"],
      ExposeHeaders: ["ETag", "x-amz-version-id"],
      MaxAgeSeconds: 3600,
    },
  ],
};

try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: corsConfig,
    })
  );
  console.log(`✅ CORS configured cho bucket "${bucket}"`);
  console.log("   Allowed origins: localhost:3000, *.vercel.app");
  console.log("   Allowed methods: PUT, GET, HEAD");
} catch (err) {
  console.error("❌ CORS setup failed:", err.message);
  process.exit(1);
}
