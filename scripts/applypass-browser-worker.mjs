#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
// patchright is a drop-in, API-compatible stealth build of Playwright: same
// chromium surface, patched to reduce bot-detection signals on ATS domains.
import { chromium } from "patchright";
import { pickAdapter } from "./ats-adapters/index.mjs";
import { detectPostingExpired } from "./ats-adapters/generic.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const WORKER_TOKEN = process.env.APPLYPASS_WORKER_TOKEN || process.env.WORKER_AUTH_TOKEN;
const WORKER_ID = process.env.APPLYPASS_WORKER_ID || `applypass-worker-${os.hostname()}`;
const POLL_MS = Number(process.env.APPLYPASS_WORKER_POLL_MS || 5000);
const IDLE_EXIT_MS = Number(process.env.APPLYPASS_IDLE_EXIT_MS || 120000);
const CONFIGURED_CONCURRENCY = Math.min(12, Math.max(1, Number(process.env.APPLYPASS_WORKER_CONCURRENCY || 4)));
const AUTO_SUBMIT = String(process.env.APPLYPASS_AUTO_SUBMIT || "false").toLowerCase() === "true";
const SCREENSHOT_DIR = process.env.APPLYPASS_SCREENSHOT_DIR || "";

// Anti-flag pacing (research-backed): at most one submission per ATS domain
// per window, plus a randomized pause between jobs. In-memory buckets are
// sufficient — the worker is a single process and all slot loops share them.
const RATE_LIMITED_DOMAINS = ["greenhouse.io", "lever.co", "ashbyhq.com"];
const DOMAIN_MIN_INTERVAL_MS = Math.max(0, Number(process.env.APPLYPASS_DOMAIN_MIN_INTERVAL_MS || 45000));
const JOB_JITTER_MIN_MS = Math.max(0, Number(process.env.APPLYPASS_JOB_JITTER_MIN_MS || 5000));
const JOB_JITTER_MAX_MS = Math.max(JOB_JITTER_MIN_MS, Number(process.env.APPLYPASS_JOB_JITTER_MAX_MS || 15000));

// Bounded retry for technical navigation/fill failures only (never for
// adapter-level business outcomes like blocked/needs_attention). Attempt
// delays follow 1s -> 2s -> 4s; with 2 retries the waits are 1s and 2s.
const JOB_MAX_RETRIES = 2;
const JOB_ATTEMPT_BACKOFF_MS = [1000, 2000, 4000];

const once = process.argv.includes("--once");
const maxTasksArg = process.argv.find((arg) => arg.startsWith("--max-tasks="));
const maxTasks = maxTasksArg ? Number(maxTasksArg.split("=")[1]) : Number(process.env.APPLYPASS_MAX_TASKS || 0);

const HANDLED_STATUSES = ["processed", "ready_for_review", "needs_review", "needs_attention", "submitted", "stopped", "skipped"];

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !WORKER_TOKEN) {
  console.error("Missing required env: SUPABASE_URL, a Supabase anon/publishable key, and APPLYPASS_WORKER_TOKEN or WORKER_AUTH_TOKEN");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Per-domain token buckets: capacity 1, refilling one token every
// DOMAIN_MIN_INTERVAL_MS. take() reserves the next window synchronously
// (no await between check and reserve), so concurrent slot loops in this
// single process can never double-acquire the same window.
const domainBuckets = new Map();

function rateLimitedDomain(url) {
  try {
    const hostname = new URL(String(url || "")).hostname.toLowerCase();
    return RATE_LIMITED_DOMAINS.find((domain) => hostname === domain || hostname.endsWith(`.${domain}`)) || null;
  } catch {
    return null;
  }
}

async function acquireDomainToken(domain) {
  if (!domain || DOMAIN_MIN_INTERVAL_MS <= 0) return;
  let bucket = domainBuckets.get(domain);
  if (!bucket) {
    bucket = { nextAvailableAt: 0 };
    domainBuckets.set(domain, bucket);
  }
  while (true) {
    const now = Date.now();
    if (now >= bucket.nextAvailableAt) {
      bucket.nextAvailableAt = now + DOMAIN_MIN_INTERVAL_MS;
      return;
    }
    await sleep(Math.min(bucket.nextAvailableAt - now, DOMAIN_MIN_INTERVAL_MS));
  }
}

function jobJitterMs() {
  if (JOB_JITTER_MAX_MS <= 0) return 0;
  return JOB_JITTER_MIN_MS + Math.floor(Math.random() * (JOB_JITTER_MAX_MS - JOB_JITTER_MIN_MS + 1));
}

async function queueCall(payload, workerId = WORKER_ID) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/applypass-agent-queue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "x-applypass-worker-token": WORKER_TOKEN,
      "x-worker-id": workerId,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Queue API ${response.status}: ${body}`);
  }

  return response.json();
}

async function claimNextTask(workerId) {
  const payload = await queueCall({ action: "claim-next", workerId }, workerId);
  return payload?.task || null;
}

async function heartbeat(taskId, log, workerId) {
  return await queueCall({ action: "heartbeat", taskId, log, workerId }, workerId);
}

async function completeTask(taskId, result, log, workerId) {
  return await queueCall({ action: "complete", taskId, result, log, workerId }, workerId);
}

async function failTask(taskId, errorMessage, result, log, workerId) {
  return await queueCall({ action: "fail", taskId, errorMessage, result, log, workerId }, workerId);
}

async function requestVerificationCode(taskId, jobId, workerId) {
  const response = await queueCall({ action: "verification-code", taskId, jobId, workerId }, workerId);
  return {
    code: response?.available && typeof response?.code === "string" ? response.code : null,
    inboxStatus: typeof response?.inbox_status === "string" ? response.inbox_status : "INBOX_CHECK_FAILED",
  };
}

async function submissionAuthorized(taskId, jobId, workerId) {
  const response = await queueCall({ action: "authorization-status", taskId, jobId, workerId }, workerId);
  return response?.authorized === true;
}

async function maybeScreenshot(page, taskId, jobId) {
  if (!SCREENSHOT_DIR) return null;
  const safeTask = String(taskId || "task").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeJob = String(jobId || "job").replace(/[^a-zA-Z0-9_-]/g, "_");
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, `${safeTask}-${safeJob}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

async function downloadResumeFile(payload) {
  const url = String(payload?.resumeFileUrl || "").trim();
  if (!url.startsWith("https://")) return { directory: null, filePath: null };

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Resume download failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) {
    throw new Error("Resume file must be between 1 byte and 10 MB");
  }

  const contentType = response.headers.get("content-type") || "";
  const extension = contentType.includes("wordprocessingml") ? ".docx" : ".pdf";
  const directory = await mkdtemp(path.join(os.tmpdir(), "resumepreps-worker-"));
  const filePath = path.join(directory, `tailored-resume${extension}`);
  await writeFile(filePath, bytes);
  return { directory, filePath };
}

async function inspectSubmissionResponse(response) {
  if (!response) return { status: null, path: null, confirmed: false };
  const status = response.status();
  let pathName = null;
  try {
    pathName = new URL(response.url()).pathname;
  } catch {
    pathName = null;
  }
  const body = await response.text().catch(() => "");
  let explicitSuccess = false;
  try {
    const parsed = JSON.parse(body);
    explicitSuccess = parsed?.success === true
      || parsed?.submitted === true
      || normalize(parsed?.status) === "success";
  } catch {
    explicitSuccess = false;
  }
  const receiptText = /(application (?:has been )?(?:received|submitted)|thank you for applying|submission confirmed|we(?:'|’)ve received your application)/i.test(body);
  return { status, path: pathName, confirmed: response.ok() && (explicitSuccess || receiptText) };
}

// Perform one submit attempt through the active adapter and gather both the
// adapter's DOM receipt and the transport-level ATS response. The adapter's
// submit() enforces the env gate + approval refusal internally; the worker
// still re-checks continuous-apply authorization immediately before calling.
async function submitViaAdapter(page, adapter, ctx, submitButton) {
  const previousUrl = page.url();
  // Watch for the ATS submission response while the adapter performs the click.
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    if (!["POST", "PUT", "PATCH"].includes(request.method())) return false;
    try {
      return new URL(response.url()).hostname.endsWith("greenhouse.io");
    } catch {
      return false;
    }
  }, { timeout: 15000 }).catch(() => null);

  // Brief human-like dwell before the final click; instant fill-and-fire is
  // the strongest automation tell for ATS spam filters.
  await page.waitForTimeout(1500 + Math.floor(Math.random() * 2500));
  const submission = await adapter.submit(page, { ...ctx, submitButton });
  let receipt;
  let submissionResponse = null;
  if (submission?.clicked) {
    [receipt, submissionResponse] = await Promise.all([
      adapter.verifyReceipt(page, { ...ctx, previousUrl }),
      responsePromise,
    ]);
  } else {
    receipt = { confirmed: false, evidence: { reason: submission?.reason || "submit refused" } };
  }
  const transport = await inspectSubmissionResponse(submissionResponse);
  return { receipt, transport };
}

async function processJob(browser, taskId, job, payload, resumeFilePath, workerId) {
  const startedAt = Date.now();
  const result = {
    jobId: String(job?.id || ""),
    title: String(job?.title || ""),
    company: String(job?.company || ""),
    url: String(job?.url || ""),
    status: "failed",
    adapter: null,
    filledCount: 0,
    totalFields: 0,
    submitButton: null,
    submitted: false,
    resumeUploaded: false,
    verificationHandled: false,
    verificationReason: null,
    requiredMissing: [],
    missingFields: [],
    submissionResponseStatus: null,
    submissionResponsePath: null,
    handoffReason: null,
    receipt: null,
    screenshotPath: null,
    error: null,
    durationMs: 0,
    attempts: 1,
  };

  const url = result.url;
  if (!url.startsWith("http")) {
    result.error = "Invalid job URL";
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= JOB_MAX_RETRIES; attempt += 1) {
    result.attempts = attempt + 1;
    if (attempt > 0) await sleep(JOB_ATTEMPT_BACKOFF_MS[attempt - 1] || 4000);
    // Fresh context + page per attempt: no navigation state, cookies, or
    // half-filled framework forms leak across retries.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      return await runJobAttempt(page, result, job, taskId, payload, resumeFilePath, workerId, startedAt);
    } catch (error) {
      lastError = error;
    } finally {
      await context.close().catch(() => {});
    }
  }
  result.error = lastError instanceof Error ? lastError.message : "Unknown browser error";
  result.durationMs = Date.now() - startedAt;
  return result;
}

// One browser attempt at a job on an already-open page. Technical failures
// (navigation timeout, crashed target, detached frame during fill) throw and
// are retried by processJob with a fresh page; adapter-level business
// outcomes (blocked / needs_attention / skipped / ready_for_review ...) are
// returned normally and are never retried.
async function runJobAttempt(page, result, job, taskId, payload, resumeFilePath, workerId, startedAt) {
  const url = result.url;
  const navResponse = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1200);

  // Liveness pre-check: clearly dead postings (HTTP 404/410 or an unambiguous
  // "job no longer available" page) are skipped before any filling, so an
  // expired listing never burns a submission attempt or daily quota.
  const navStatus = navResponse ? navResponse.status() : null;
  if (navStatus === 404 || navStatus === 410 || await detectPostingExpired(page)) {
    result.status = "skipped";
    result.handoffReason = "posting_expired";
    result.error = "The job posting is no longer available; skipped before filling so no submission quota was used.";
    result.screenshotPath = await maybeScreenshot(page, taskId, result.jobId);
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const adapter = await pickAdapter(url, page);
    result.adapter = adapter.metadata.name;
    const handleVerification = typeof adapter.handleVerification === "function"
      ? (p, c) => adapter.handleVerification(p, c)
      : null;

    // Approval is resolved up-front because adapters need it while filling
    // (consent options and demographic declines are only committed when the
    // applicant approved this job for submission).
    const approval = job?.approvalReceipt || payload?.approvalReceipts?.[result.jobId];
    const approved = approval?.approved === true && typeof approval?.reviewedAt === "string";

    // Adapters never talk to the queue directly; capabilities are injected so
    // the env gate + approval + continuous-authorization checks stay here.
    // requestVerificationCode returns { code, inboxStatus } so adapters can
    // surface inbox handoff reasons (reconnect / not linked / not received).
    const ctx = {
      profile: payload?.candidateProfile || {},
      answers: payload?.answerMemory || {},
      documents: { resumePath: resumeFilePath || null, coverLetterPath: null },
      autoSubmit: AUTO_SUBMIT,
      approved,
      taskId,
      jobId: result.jobId,
      workerId,
      requestVerificationCode: () => requestVerificationCode(taskId, result.jobId, workerId),
      heartbeat: (log) => heartbeat(taskId, log, workerId),
    };

    const prep = await adapter.prepare(page, ctx);
    if (prep?.blocked) {
      // CAPTCHA / login walls are never bypassed: a human has to take over.
      result.status = "needs_attention";
      result.error = prep.blocked.message || `Blocked by ${prep.blocked.kind || "page challenge"}; submission was not attempted.`;
      result.screenshotPath = await maybeScreenshot(page, taskId, result.jobId);
      result.durationMs = Date.now() - startedAt;
      return result;
    }

    // Adapters upload documents and fill custom dropdowns before plain
    // inputs (framework forms can re-render after uploads).
    const filled = await adapter.fillFields(page, ctx);
    result.filledCount = Number(filled?.filledCount || 0);
    result.totalFields = Number(filled?.totalFields || 0);

    const upload = filled?.upload || { fileInputs: 0, resumeInputs: 0, uploaded: 0, requiredMissing: false };
    result.resumeUploaded = upload.uploaded > 0;

    const verification = filled?.verification || { requested: false, completed: false };
    result.verificationHandled = verification.completed;
    result.verificationReason = verification.reason || null;

    const submitButton = await adapter.findSubmitButton(page);
    result.submitButton = submitButton?.label || null;

    const review = await adapter.reviewState(page);
    const requiredMissing = Array.isArray(review?.requiredMissing) ? review.requiredMissing : [];
    result.requiredMissing = requiredMissing;
    result.missingFields = Array.isArray(review?.missingFields)
      ? review.missingFields
      : requiredMissing.map((label) => ({ id: "", type: "input", label }));
    const incompleteRequired = Number(review?.incompleteRequired ?? requiredMissing.length);
    const blocked = upload.requiredMissing || requiredMissing.length > 0 || (verification.requested && !verification.completed);

    // Continuous-authorization re-check immediately before any final submit.
    const stillAuthorized = submitButton && AUTO_SUBMIT && approved && !blocked
      ? await submissionAuthorized(taskId, result.jobId, workerId)
      : false;

    if (submitButton && AUTO_SUBMIT && approved && !blocked && stillAuthorized) {
      let { receipt, transport } = await submitViaAdapter(page, adapter, ctx, submitButton);
      result.submissionResponseStatus = transport.status;
      result.submissionResponsePath = transport.path;
      result.submitted = receipt.confirmed === true || transport.confirmed === true;
      result.receipt = receipt.evidence || null;

      // Post-submit employer verification handoff: some ATS forms (Greenhouse
      // security-code step) only reveal the emailed verification field AFTER
      // the first submit click, answering with a 428 or an on-page prompt.
      if (!result.submitted
        && handleVerification
        && (transport.status === 428 || receipt?.evidence?.verificationRequired)) {
        const postSubmitVerification = await handleVerification(page, ctx);
        result.verificationHandled = postSubmitVerification.completed;
        result.verificationReason = postSubmitVerification.reason || null;
        if (postSubmitVerification.completed) {
          const verificationButton = await adapter.findSubmitButton(page);
          // Re-check continuous-apply authorization before the second submit.
          const remainsAuthorized = verificationButton
            ? await submissionAuthorized(taskId, result.jobId, workerId)
            : false;
          if (verificationButton && remainsAuthorized) {
            ({ receipt, transport } = await submitViaAdapter(page, adapter, ctx, verificationButton));
            result.submissionResponseStatus = transport.status;
            result.submissionResponsePath = transport.path;
            result.submitted = receipt.confirmed === true || transport.confirmed === true;
            result.receipt = receipt.evidence || null;
          }
        }
      }

      // Receipt upgrade: keep the employer's own confirmation text (first
      // 2000 chars) alongside the DOM receipt so submissions stay verifiable
      // later even if the ATS page changes or expires.
      if (result.submitted) {
        const confirmationText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
        result.receipt = { ...(result.receipt || {}), confirmationText: String(confirmationText || "").slice(0, 2000) };
      }

      result.status = result.submitted ? "submitted" : "needs_review";
      if (!result.submitted) {
        const visibleAlert = receipt?.evidence?.visibleAlerts?.[0];
        if (transport.status === 428) {
          result.handoffReason = "employer_verification";
          result.error = result.verificationHandled
            ? "The employer did not confirm the verification code. Open the prepared application to review the final step."
            : result.verificationReason === "INBOX_RECONNECT_REQUIRED"
              ? "Reconnect Gmail to continue employer verification. Your prepared application is unchanged."
              : result.verificationReason === "JOB_INBOX_NOT_LINKED"
                ? "The application inbox is not linked to this job. Open the prepared application to complete verification."
                : "The employer verification code did not arrive in the connected inbox. Open the prepared application to complete the final check.";
        } else {
          result.error = receipt?.evidence?.spamFlagged
            ? "The employer's spam filter rejected this submission (flagged as possible spam)."
            : visibleAlert
              ? `The employer form did not accept the submission: ${visibleAlert}`
              : `The employer did not confirm submission. Open the prepared application to review the final step.`;
        }
      }
    } else if (submitButton) {
      result.status = AUTO_SUBMIT && approved && !blocked && !stillAuthorized
        ? "stopped"
        : blocked
          ? (review?.recommendation === "needs_attention" ? "needs_attention" : "needs_review")
          : "ready_for_review";
      if (result.status === "stopped") {
        result.error = "Continuous Apply was stopped before final submission.";
      } else if (blocked) {
        result.error = upload.requiredMissing
          ? "A required attachment is missing; submission was not attempted."
          : verification.requested && !verification.completed
            ? "Email verification is required. Connect the application inbox or request a new code, then retry."
          : `${incompleteRequired} required field(s) still need review; submission was not attempted.`;
      }
    }

    result.screenshotPath = await maybeScreenshot(page, taskId, result.jobId);
    if (result.status === "failed") result.status = "processed";
    result.durationMs = Date.now() - startedAt;
    return result;
}

async function processTask(task, workerId) {
  const taskId = String(task?.id || "");
  const payload = task?.payload || {};
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];

  const started = nowIso();
  const jobResults = [];
  let resumeFile = { directory: null, filePath: null };

  // Heartbeat is only accepted while the task is still 'running'. When the
  // queue reaper (or a cancel) moves the task on, the next heartbeat is
  // rejected: this worker no longer owns the task and must stop without
  // completing/failing it, or the task would be double-processed alongside
  // the worker that re-claims it. A transient network error fails the same
  // (safe) way — the reaper eventually re-queues the task.
  let taskLost = false;
  const guardedHeartbeat = async (log) => {
    if (taskLost) return;
    try {
      await heartbeat(taskId, log, workerId);
    } catch (error) {
      taskLost = true;
      console.warn(`[ApplyPass Worker] ${workerId} lost task ${taskId}; stopping: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (jobs.length === 0) {
    await failTask(taskId, "Task has no jobs.", { jobs: [] }, {
      level: "error",
      workerId,
      at: nowIso(),
      message: "Task payload missing jobs",
    }, workerId);
    return;
  }

  const browser = await chromium.launch({ headless: true });

  try {
    resumeFile = await downloadResumeFile(payload);
    await guardedHeartbeat({
      level: "info",
      workerId,
      at: nowIso(),
      message: `Started task with ${jobs.length} jobs (attempt ${Number(task?.attempt_count || 1)}/${Number(task?.max_attempts || 3)})`,
    });

    let isFirstJob = true;
    for (const job of jobs) {
      if (taskLost) break;
      // Randomized pause between jobs so request patterns do not look like a
      // machine gun burst to the ATS edge (5-15s by default).
      if (!isFirstJob) {
        const jitter = jobJitterMs();
        if (jitter > 0) await sleep(jitter);
        if (taskLost) break;
      }
      isFirstJob = false;

      await guardedHeartbeat({
        level: "info",
        workerId,
        at: nowIso(),
        message: `Processing job: ${String(job?.title || "Unknown")}`,
      }, workerId);

      if (taskLost) break;
      // Per-domain token bucket: max one submission per window per ATS domain.
      // Waits here are bounded by DOMAIN_MIN_INTERVAL_MS (45s default), far
      // below the 10-minute queue-reaper heartbeat staleness threshold.
      await acquireDomainToken(rateLimitedDomain(job?.url));

      const result = await processJob(browser, taskId, job, payload, resumeFile.filePath, workerId);
      jobResults.push(result);

      await guardedHeartbeat({
        level: HANDLED_STATUSES.includes(result.status) ? "info" : "warn",
        workerId,
        at: nowIso(),
        message: HANDLED_STATUSES.includes(result.status)
          ? `${result.status}: ${result.title}`
          : `Failed ${result.title}: ${result.error}`,
        jobId: result.jobId,
      }, workerId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    await failTask(taskId, message, { jobs: jobResults }, {
      level: "error",
      workerId,
      at: nowIso(),
      message,
    }, workerId);
    return;
  } finally {
    await browser.close();
    if (resumeFile.directory) await rm(resumeFile.directory, { recursive: true, force: true });
  }

  // Ownership was lost mid-run: leave the task to its new owner / the reaper.
  if (taskLost) {
    console.warn(`[ApplyPass Worker] ${workerId} abandoned task ${taskId} after ${jobResults.length} job(s); not reporting completion.`);
    return;
  }

  const success = jobResults.filter((r) => HANDLED_STATUSES.includes(r.status)).length;
  const failed = jobResults.length - success;

  const summary = {
    workerId,
    startedAt: started,
    completedAt: nowIso(),
    autoSubmit: AUTO_SUBMIT,
    success,
    failed,
    jobs: jobResults,
  };

  if (success === 0) {
    await failTask(taskId, "All jobs failed in worker run", summary, {
      level: "error",
      workerId,
      at: nowIso(),
      message: "Worker run finished with zero successful jobs",
    }, workerId);
  } else {
    await completeTask(taskId, summary, {
      level: "info",
      workerId,
      at: nowIso(),
      message: `Worker completed task. Success: ${success}, Failed: ${failed}`,
    }, workerId);
  }
}

async function runSlot(slotIndex) {
  const workerId = `${WORKER_ID}:${slotIndex + 1}`;
  const slotStartedAt = Date.now();
  let processed = 0;

  while (true) {
    try {
      const task = await claimNextTask(workerId);

      if (!task) {
        if (once) break;
        if (maxTasks > 0 && processed >= maxTasks) break;
        if (Date.now() - slotStartedAt >= IDLE_EXIT_MS) {
          console.log(`[ApplyPass Worker] ${workerId} idle for ${IDLE_EXIT_MS}ms with empty queue; exiting slot.`);
          break;
        }
        await sleep(POLL_MS);
        continue;
      }

      console.log(`[ApplyPass Worker] ${workerId} claimed task ${task.id} (attempt ${Number(task.attempt_count || 1)}/${Number(task.max_attempts || 3)})`);
      await processTask(task, workerId);
      processed += 1;

      if (once) break;
      if (maxTasks > 0 && processed >= maxTasks) break;
    } catch (error) {
      console.error(`[ApplyPass Worker] ${workerId} error: ${error instanceof Error ? error.message : String(error)}`);
      if (once) break;
      await sleep(POLL_MS);
    }
  }
  return processed;
}

async function run() {
  const concurrency = once || maxTasks > 0 ? 1 : CONFIGURED_CONCURRENCY;
  console.log(`[ApplyPass Worker] Started as ${WORKER_ID}. slots=${concurrency} once=${once} maxTasks=${maxTasks || "unlimited"}`);
  console.log(`[ApplyPass Worker] Auto submit: ${AUTO_SUBMIT ? "ON" : "OFF"}`);
  const totals = await Promise.all(Array.from({ length: concurrency }, (_, index) => runSlot(index)));
  const processed = totals.reduce((sum, value) => sum + value, 0);
  console.log(`[ApplyPass Worker] Exiting. processed=${processed}`);
}

// Exported for the local mock e2e test (scripts/ats-adapters/mock-e2e.test.mjs),
// which drives the real processJob flow against a served fixture.
export { processJob, processTask };

// Only run the worker loop when executed directly, not when imported.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  run().catch((error) => {
    console.error(`[ApplyPass Worker] Fatal: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
