/**
 * Setup CORS cho R2 bucket để browser PUT thẳng file lên được.
 *
 * Chạy: node tools/setup-r2-cors.mjs
 *
 * CHỈ CÒN ĐƯỜNG UPLOAD CẦN CORS. Đường đọc (preview map/bảng) đã đi vòng qua
 * `/api/r2/object` nên same-origin, không đụng CORS nữa. Nhưng upload thì browser
 * PUT thẳng lên presigned URL của R2 (`UploadDropzone.tsx`) — không thể proxy qua
 * app vì serverless function của Vercel giới hạn body ~4.5MB, trong khi dataset
 * lên tới hàng trăm MB. Nên origin của app BẮT BUỘC phải nằm trong policy này.
 *
 * QUYỀN: sửa CORS cần token R2 loại "Admin Read & Write". Token chỉ có quyền
 * object (đọc/ghi file) sẽ trả `Access Denied` — script in sẵn hướng dẫn khi gặp.
 * Nếu không muốn đổi token chính, thêm cặp key admin riêng vào `.env.local`:
 *   R2_ADMIN_ACCESS_KEY_ID=...
 *   R2_ADMIN_SECRET_ACCESS_KEY=...
 */
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";
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
const bucket = process.env.R2_BUCKET_NAME;
// Ưu tiên key admin nếu có — key thường chỉ đủ quyền object, không sửa được config.
const accessKeyId = process.env.R2_ADMIN_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const secretAccessKey =
  process.env.R2_ADMIN_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
const usingAdminKeys = !!process.env.R2_ADMIN_ACCESS_KEY_ID;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("❌ Missing R2 env vars trong .env.local");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

/**
 * Cổng dev KHÔNG chỉ có 3000: `next dev` tự nhảy sang cổng kế tiếp khi 3000 bị
 * chiếm (máy Ninh có sẵn một site khác ngồi ở 3000). Thiếu đúng cổng đang chạy
 * thì upload chết với `TypeError: Failed to fetch` — không mã lỗi, không log
 * server, chỉ hỏng ở máy dev nên rất dễ tưởng là lỗi khác.
 *
 * Liệt kê hẳn dải 3000–3010 thay vì đoán wildcard theo cổng: tài liệu Cloudflare
 * chỉ nói origin phải đúng dạng `scheme://host[:port]`, KHÔNG hề nói `*` thay
 * được cho cổng. Wildcard theo subdomain thì chắc chắn chạy (`*.vercel.app` đã
 * kiểm bằng preflight thật).
 */
const DEV_PORTS = Array.from({ length: 11 }, (_, i) => 3000 + i);
const devOrigins = DEV_PORTS.flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);

// Origin phát sinh (cổng lạ, domain riêng khi rời vercel.app) — thêm vào
// .env.local, ngăn cách bằng dấu phẩy, khỏi phải sửa file này.
const extraOrigins = (process.env.R2_CORS_EXTRA_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = [...devOrigins, "https://*.vercel.app", ...extraOrigins];

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: allowedOrigins,
      AllowedMethods: ["PUT", "GET", "HEAD"],
      AllowedHeaders: ["Content-Type", "x-amz-*", "X-Amz-*"],
      ExposeHeaders: ["ETag", "x-amz-version-id"],
      MaxAgeSeconds: 3600,
    },
  ],
};

try {
  await client.send(
    new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: corsConfig })
  );
  console.log(
    `✅ CORS configured cho bucket "${bucket}"${usingAdminKeys ? " (dùng key admin)" : ""}`
  );

  // Đọc lại từ server — Put trả 200 không có nghĩa policy đã đúng như mong đợi.
  const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  const applied = current.CORSRules?.[0]?.AllowedOrigins ?? [];
  console.log(`   Đã áp ${applied.length} origin:`);
  console.log(`   - dev: localhost/127.0.0.1 cổng ${DEV_PORTS[0]}–${DEV_PORTS.at(-1)}`);
  console.log(`   - prod: https://*.vercel.app`);
  if (extraOrigins.length > 0) {
    console.log(`   - thêm từ R2_CORS_EXTRA_ORIGINS: ${extraOrigins.join(", ")}`);
  }
  console.log("   Methods: PUT, GET, HEAD");
} catch (err) {
  const denied = /Access Denied|AccessDenied/i.test(err.message ?? "");
  console.error(`❌ CORS setup failed: ${err.message}`);
  if (denied) {
    console.error("");
    console.error("   Token R2 đang dùng KHÔNG có quyền sửa config bucket.");
    console.error("   Chọn một trong hai cách:");
    console.error("");
    console.error("   (a) Tạo token mới ở Cloudflare → R2 → API → Create API token,");
    console.error('       chọn quyền "Admin Read & Write", rồi thêm vào .env.local:');
    console.error("         R2_ADMIN_ACCESS_KEY_ID=...");
    console.error("         R2_ADMIN_SECRET_ACCESS_KEY=...");
    console.error("       xong chạy lại script này.");
    console.error("");
    console.error("   (b) Dán tay trên dashboard: R2 → bucket → Settings → CORS policy");
    console.error("       → Edit, dán nguyên khối JSON dưới đây:");
    console.error("");
    console.error(JSON.stringify(corsConfig.CORSRules, null, 2));
  }
  process.exit(1);
}
