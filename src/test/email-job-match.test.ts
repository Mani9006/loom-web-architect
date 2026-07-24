import { describe, expect, it } from "vitest";
import { matchEmailToJob } from "../../supabase/functions/_shared/email-job-match";

const jobs = [
  { id: "rokt", company: "Rokt", job_title: "Senior Software Engineer" },
  { id: "mindrift", company: "Mindrift", job_title: "AI Training Specialist" },
  { id: "scale", company: "Scale AI", job_title: "AI Training Specialist" },
];

describe("application email job matching", () => {
  it("matches the employer named in the subject and body lead", () => {
    const match = matchEmailToJob(jobs, {
      subject: "We received your application at Rokt",
      from: "Recruiting <notifications@jobs.rokt.com>",
      body: "Thanks for applying to Rokt for the Senior Software Engineer role.",
    });

    expect(match?.id).toBe("rokt");
  });

  it("ignores a historical employer in copied application data deep in the body", () => {
    const match = matchEmailToJob(jobs, {
      subject: "Your application to Rokt",
      from: "Tsenta Applications <updates@tsenta.com>",
      body: [
        "Your application to Rokt has been submitted successfully.",
        "We will share updates when the employer responds.",
        " ".repeat(850),
        "Copied resume: Scale AI — AI Training Specialist — prior experience.",
      ].join("\n"),
    });

    expect(match?.id).toBe("rokt");
  });

  it("does not link a Rokt confirmation to Scale AI from a later resume mention", () => {
    const match = matchEmailToJob([jobs[2]], {
      subject: "Your Rokt application was submitted",
      from: "Tsenta Applications <updates@tsenta.com>",
      body: [
        "Your application was delivered to Rokt. No action is needed.",
        "Copied resume:",
        "Scale AI — AI Training Specialist — prior experience.",
      ].join("\n"),
    });

    expect(match).toBeNull();
  });

  it("treats the employer named in the subject as authoritative", () => {
    const match = matchEmailToJob([jobs[2]], {
      subject: "Your application to Rokt was submitted",
      from: "Tsenta Applications <updates@tsenta.com>",
      body: "Submission complete. Candidate profile includes prior work at Scale AI.",
    });

    expect(match).toBeNull();
  });

  it("uses an employer sender domain as a strong identity signal", () => {
    const match = matchEmailToJob(jobs, {
      subject: "Application received",
      from: "Mindrift Recruiting <no-reply@mindrift.ai>",
      body: "Thank you. We will review your application.",
    });

    expect(match?.id).toBe("mindrift");
  });

  it("fails closed when generic title signals are ambiguous", () => {
    const match = matchEmailToJob([jobs[1], jobs[2]], {
      subject: "AI Training Specialist application update",
      from: "ATS Notifications <noreply@example-ats.com>",
      body: "Your AI Training Specialist application is under review.",
    });

    expect(match).toBeNull();
  });

  it("fails closed when two employers have equally strong lead signals", () => {
    const match = matchEmailToJob([jobs[0], jobs[2]], {
      subject: "Application update",
      from: "ATS Notifications <noreply@example-ats.com>",
      body: "This update references both Rokt and Scale AI applications.",
    });

    expect(match).toBeNull();
  });
});
