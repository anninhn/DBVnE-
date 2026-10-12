// Cho phép chạy code trong src/ bằng node thuần (ánh xạ "@/…", bỏ đuôi .ts, giả next/cache).
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);
