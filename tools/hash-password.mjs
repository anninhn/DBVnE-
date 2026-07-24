#!/usr/bin/env node
/**
 * Hash password với bcrypt cost 12 — dán vào datasets/_users/users.json.
 *
 * Usage:
 *   node tools/hash-password.mjs              // prompt nhập password
 *   node tools/hash-password.mjs "my-pass"    // pass qua arg (không recommend — lưu vào shell history)
 *
 * Password policy: ≥12 ký tự, không dictionary word.
 *
 * Cost 12 ~300ms với bcryptjs pure-JS — acceptable cho internal tool 3-5 user.
 */
import bcrypt from "bcryptjs";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";

const COST = 12;
const MIN_LENGTH = 12;

async function main() {
  let password = process.argv[2];

  if (!password) {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    password = await rl.question("Password (≥12 ký tự): ");
    rl.close();
  }

  if (!password || password.length < MIN_LENGTH) {
    console.error(
      `✗ Password quá ngắn — tối thiểu ${MIN_LENGTH} ký tự (nhận được ${password?.length ?? 0})`
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, COST);
  console.log("\n✓ Bcrypt hash (cost " + COST + "):");
  console.log(hash);
  console.log("\nDán vào datasets/_users/users.json tại field passwordHash.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
