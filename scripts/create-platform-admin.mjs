// Creates the platform-admin account. There is deliberately no sign-up page for
// this role: the only way to get one is to run this on a machine that holds the
// database's service key.
//
//   npm run create-admin
//
// Prerequisites: migrations 0027 and 0028 are applied, and .env.local has
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { validatePassword } from "../lib/password-policy.ts";

function loadEnv(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        })
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnv(new URL("../.env.local", import.meta.url)), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Same, but nothing is echoed back while typing.
function askHidden(question) {
  return new Promise((resolve) => {
    const write = rl._writeToOutput;
    process.stdout.write(question);
    rl._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl._writeToOutput = write;
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const fullName = (await ask("Full name: ")).trim();
const email = (await ask("Email (sign-in + alerts go here): ")).trim().toLowerCase();

if (!fullName || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error("Enter a name and a valid email.");
  process.exit(1);
}

const existing = await fetch(`${url}/rest/v1/users?select=id,role&email=eq.${encodeURIComponent(email)}`, { headers });
const found = await existing.json();

if (!existing.ok) {
  console.error("Could not check existing accounts:", found);
  process.exit(1);
}
if (found.length > 0) {
  console.error(`An account with ${email} already exists (${found[0].role}). Use a different email.`);
  process.exit(1);
}

const password = await askHidden("Password (12+ characters): ");
const again = await askHidden("Repeat password: ");
rl.close();

if (password !== again) {
  console.error("The passwords don't match.");
  process.exit(1);
}

const problem = validatePassword(password, { email, role: "platform_admin" });
if (problem) {
  console.error(problem);
  process.exit(1);
}

const response = await fetch(`${url}/rest/v1/users`, {
  method: "POST",
  headers: { ...headers, Prefer: "return=minimal" },
  body: JSON.stringify({
    id: randomUUID(),
    role: "platform_admin",
    full_name: fullName,
    email,
    password_hash: await bcrypt.hash(password, 12),
  }),
});

if (!response.ok) {
  console.error("Could not create the account:", await response.text());
  console.error("Have migrations 0027 and 0028 been run?");
  process.exit(1);
}

console.log(`\nDone. Sign in at the normal login page with ${email}; you'll land on /platform.`);
