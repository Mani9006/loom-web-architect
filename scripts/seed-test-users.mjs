#!/usr/bin/env node
/**
 * Create isolated QA users with fresh passwords.
 *
 * Required:
 *   SEED_ENVIRONMENT=development|staging|production
 *   SUPABASE_URL=https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<secret>
 *
 * Production is denied unless ALLOW_PRODUCTION_TEST_USERS=true. Passwords are
 * generated on every run, printed once, and never stored in source control.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
const ENVIRONMENT = (process.env.SEED_ENVIRONMENT ?? "").toLowerCase();
const ALLOWED_ENVIRONMENTS = new Set(["development", "staging", "production"]);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ALLOWED_ENVIRONMENTS.has(ENVIRONMENT)) {
  console.error("Missing or invalid configuration. Set SEED_ENVIRONMENT, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (ENVIRONMENT === "production" && process.env.ALLOW_PRODUCTION_TEST_USERS !== "true") {
  console.error("Production QA users are disabled. Set ALLOW_PRODUCTION_TEST_USERS=true for an intentional one-time run.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const accountSpecs = ENVIRONMENT === "production"
  ? [
      { kind: "smoke-free", fullName: "Production Smoke Free", role: "user", plan: "free" },
      { kind: "smoke-pro", fullName: "Production Smoke Pro", role: "user", plan: "pro" },
    ]
  : [
      { kind: "free", fullName: `${title(ENVIRONMENT)} QA Free`, role: "user", plan: "free" },
      { kind: "pro", fullName: `${title(ENVIRONMENT)} QA Pro`, role: "user", plan: "pro" },
      { kind: "autopilot", fullName: `${title(ENVIRONMENT)} QA Autopilot`, role: "user", plan: "autopilot" },
      { kind: "admin", fullName: `${title(ENVIRONMENT)} QA Admin`, role: "admin", plan: "pro" },
    ];

const users = accountSpecs.map((spec) => ({
  ...spec,
  email: `qa+${ENVIRONMENT}-${spec.kind}@resumepreps.test`,
  password: `${randomBytes(18).toString("base64url")}Aa1!`,
}));

async function findUserId(email) {
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function upsertUser(account) {
  const existingId = await findUserId(account.email);
  const attributes = {
    password: account.password,
    email_confirm: true,
    user_metadata: {
      full_name: account.fullName,
      seeded: true,
      seed_environment: ENVIRONMENT,
    },
  };

  let userId;
  if (existingId) {
    const { data, error } = await sb.auth.admin.updateUserById(existingId, attributes);
    if (error) throw new Error(`update ${account.email}: ${error.message}`);
    userId = data.user.id;
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email: account.email, ...attributes });
    if (error) throw new Error(`create ${account.email}: ${error.message}`);
    userId = data.user.id;
  }

  const { error: profileError } = await sb.from("profiles").upsert(
    { user_id: userId, full_name: account.fullName, onboarding_completed: true },
    { onConflict: "user_id" },
  );
  if (profileError) throw new Error(`profile ${account.email}: ${profileError.message}`);

  if (account.role === "admin") {
    const { error: roleError } = await sb.from("user_roles").upsert(
      { user_id: userId, role: "admin" },
      { onConflict: "user_id,role" },
    );
    if (roleError) throw new Error(`role ${account.email}: ${roleError.message}`);
  }

  const { error: accessError } = await sb.from("user_access_controls").upsert(
    {
      user_id: userId,
      account_status: "active",
      subscription_plan: account.plan,
      purchase_state: "manual",
      ai_features_enabled: account.plan !== "free",
    },
    { onConflict: "user_id" },
  );
  if (accessError) throw new Error(`access ${account.email}: ${accessError.message}`);

  return userId;
}

const host = new URL(SUPABASE_URL).hostname;
console.log(`Creating ${ENVIRONMENT} QA users in ${host}...`);

const credentials = [];
for (const account of users) {
  try {
    const userId = await upsertUser(account);
    credentials.push({
      email: account.email,
      password: account.password,
      plan: account.plan,
      role: account.role,
      user_id: userId,
    });
  } catch (error) {
    console.error(`${account.email}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (credentials.length > 0) {
  console.log("\nCredentials (save in a password manager; the passwords rotate on the next run):");
  console.table(credentials.map(({ user_id: _userId, ...credential }) => credential));
}

function title(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
