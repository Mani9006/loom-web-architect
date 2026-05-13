#!/usr/bin/env node
/**
 * Seed test users into a Supabase project (staging or prod).
 *
 * Creates 3 deterministic accounts so anyone testing the app has a known login:
 *   - test-free@resumeprep.local    — free tier, fresh account
 *   - test-pro@resumeprep.local     — pro subscription
 *   - test-admin@resumeprep.local   — admin role + pro
 *
 * Idempotent: if a user already exists, the script updates their profile +
 * access state instead of erroring.
 *
 * Usage:
 *   # Staging
 *   SUPABASE_URL=https://yiqsmjtblahdorgsurrh.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ...staging-service-role... \
 *   node scripts/seed-test-users.mjs
 *
 *   # Prod (only do this once, then turn off — these are real accounts on prod)
 *   SUPABASE_URL=https://woxtbyotydxorcdhhivr.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ...prod-service-role... \
 *   node scripts/seed-test-users.mjs
 *
 * The service role key is the SECRET one (not the anon key). Grab it from:
 *   Supabase dashboard → Project Settings → API → service_role
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("✗ Missing SUPABASE_URL or SERVICE_ROLE_KEY env vars");
  console.error("  See header of this script for usage.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  {
    email: "test-free@resumeprep.local",
    password: "TestFree2026!",
    fullName: "Test Free",
    role: "user",
    plan: "free",
    state: "active",
  },
  {
    email: "test-pro@resumeprep.local",
    password: "TestPro2026!",
    fullName: "Test Pro",
    role: "user",
    plan: "pro",
    state: "active",
  },
  {
    email: "test-admin@resumeprep.local",
    password: "TestAdmin2026!",
    fullName: "Test Admin",
    role: "admin",
    plan: "pro",
    state: "active",
  },
];

async function findUserId(email) {
  // Auth admin API can list users; paginate until we find ours.
  // For 3 test users in a low-volume staging project this is fine.
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) return null; // exhausted
    page += 1;
    if (page > 25) return null; // safety
  }
}

async function upsertUser(u) {
  const existingId = await findUserId(u.email);
  let userId;
  if (existingId) {
    const { data, error } = await sb.auth.admin.updateUserById(existingId, {
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.fullName, seeded: true },
    });
    if (error) throw new Error(`update ${u.email}: ${error.message}`);
    userId = data.user.id;
    console.log(`  ↻ updated ${u.email} (${userId})`);
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.fullName, seeded: true },
    });
    if (error) throw new Error(`create ${u.email}: ${error.message}`);
    userId = data.user.id;
    console.log(`  ＋ created ${u.email} (${userId})`);
  }

  // profile
  await sb
    .from("profiles")
    .upsert(
      { user_id: userId, full_name: u.fullName },
      { onConflict: "user_id" },
    )
    .then(({ error }) => { if (error) console.warn(`    profiles upsert: ${error.message}`); });

  // user_roles (only for non-user roles)
  if (u.role !== "user") {
    await sb
      .from("user_roles")
      .upsert({ user_id: userId, role: u.role }, { onConflict: "user_id,role" })
      .then(({ error }) => { if (error) console.warn(`    user_roles upsert: ${error.message}`); });
  }

  // user_access_controls — only insert for paid plans. The free default is
  // "no row = free + active" (see enforceAccountActive in functions/_shared/guards.ts).
  if (u.plan !== "free") {
    await sb
      .from("user_access_controls")
      .upsert(
        {
          user_id: userId,
          account_status: u.state,
          subscription_plan: u.plan,
          purchase_state: "manual",
          ai_features_enabled: true,
        },
        { onConflict: "user_id" },
      )
      .then(({ error }) => { if (error) console.warn(`    user_access_controls upsert: ${error.message}`); });
  }
}

(async () => {
  const host = new URL(SUPABASE_URL).hostname;
  console.log(`→ seeding test users into ${host}\n`);

  for (const u of USERS) {
    try {
      await upsertUser(u);
    } catch (e) {
      console.error(`  ✗ ${u.email}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\n✓ done. Credentials:");
  for (const u of USERS) {
    console.log(`  ${u.email.padEnd(36)}  ${u.password.padEnd(16)}  (${u.plan}/${u.role})`);
  }
})();
