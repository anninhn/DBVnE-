#!/usr/bin/env node
/**
 * Dựng lại chỉ mục tra cứu từ metadata trong git, ghi lên R2.
 *
 * Chỉ mục là dữ liệu **sinh ra**, không phải nguồn sự thật — dựng lại lúc nào
 * cũng ra đúng kết quả cũ nếu metadata không đổi. Nên khi nghi ngờ chỉ mục lệch,
 * cách xử lý luôn là chạy lại script này, không phải sửa tay file trên R2.
 *
 * Việc dựng nằm ở `POST /api/retrieval/build-index`, không nằm trong script này:
 * nó dùng chính hàm đọc metadata của app và chính hàm chuẩn hoá của tầng tra cứu.
 * Viết lại chúng ở đây là tạo bản chuẩn hoá thứ hai — mà lệch chuẩn hoá thì tra
 * không ra và không có triệu chứng nào (D4).
 *
 * An toàn: dry-run là mặc định. Phải có `--apply` mới ghi lên R2.
 *
 * Usage:
 *   node --env-file=.env.local tools/build-retrieval-index.mjs
 *   node --env-file=.env.local tools/build-retrieval-index.mjs --apply
 *
 * Flags:
 *   --base <url>   base URL của app   (mặc định http://localhost:3000)
 *   --apply        ghi thật lên R2
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const BASE = flag("base", "http://localhost:3000").replace(/\/$/, "");
const APPLY = args.includes("--apply");

const USER = process.env.PLATFORM_USER;
const PASS = process.env.PLATFORM_PASS;

if (!USER || !PASS) {
  console.error(
    "Cần PLATFORM_USER / PLATFORM_PASS. Thêm vào .env.local rồi chạy với --env-file=.env.local.",
  );
  process.exit(2);
}

const jar = new Map();

function saveCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function req(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.headers ?? {}),
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
  });
  saveCookies(res);
  return res;
}

async function login() {
  const { csrfToken } = await (await req(`${BASE}/api/auth/csrf`)).json();
  await req(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      username: USER,
      password: PASS,
      callbackUrl: BASE,
      json: "true",
    }),
  });
  const session = await (await req(`${BASE}/api/auth/session`)).json();
  if (!session?.user?.username) {
    throw new Error("Đăng nhập thất bại — kiểm tra PLATFORM_USER / PLATFORM_PASS");
  }
  return session.user.username;
}

async function main() {
  const who = await login();
  console.log(`Đăng nhập: ${who} — ${APPLY ? "GHI THẬT lên R2" : "dry-run"}\n`);

  const res = await req(`${BASE}/api/retrieval/build-index`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apply: APPLY }),
  });
  const out = await res.json();

  if (!res.ok) {
    console.error(`Lỗi ${res.status}:`, out.error ?? out);
    process.exit(1);
  }

  console.log(`dataset đọc được : ${out.datasetsRead}`);
  console.log(`cột vào chỉ mục  : ${out.columnsIndexed}`);
  console.log(`khoá tra         : ${out.keys}`);
  console.log(`cột chưa tra hết : ${out.partialColumns}`);
  console.log(`kích thước       : ${out.sizeKb} KB`);
  console.log(`thời gian        : ${(out.elapsedMs / 1000).toFixed(1)}s`);

  // Dataset đọc không ra KHÔNG được lướt qua: chỉ mục thiếu nó thì mọi câu hỏi
  // "dataset nào có X" sau này đều trả lời sai về nó mà không có dấu hiệu gì.
  if (out.unreadable?.length) {
    console.log(`\nĐỌC KHÔNG RA ${out.unreadable.length} dataset — chỉ mục đang THIẾU:`);
    for (const slug of out.unreadable) console.log(`  - ${slug}`);
  }

  if (!APPLY) console.log("\nĐây là dry-run — chưa ghi gì. Thêm --apply để ghi lên R2.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
