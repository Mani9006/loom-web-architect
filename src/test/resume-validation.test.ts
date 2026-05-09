import { describe, expect, it } from "vitest";
import {
  emailSchema,
  getDateFormatSuggestion,
  getSummaryWarning,
  linkedinSchema,
  nameSchema,
  phoneSchema,
  requiredEmailSchema,
  urlSchema,
  validateEducationEntry,
  validateExperienceEntry,
  validateField,
  validateRequiredField,
} from "@/lib/resume-validation";

describe("resume-validation production helpers", () => {
  describe("validateField", () => {
    it("allows optional empty and whitespace-only values", () => {
      expect(validateField(emailSchema, "")).toBeNull();
      expect(validateField(phoneSchema, "   ")).toBeNull();
      expect(validateField(urlSchema, "\n\t")).toBeNull();
    });

    it("validates email, phone, URL, and LinkedIn formats", () => {
      expect(validateField(emailSchema, "candidate@example.com")).toBeNull();
      expect(validateField(emailSchema, "candidate-at-example")).toBe("Invalid email format");

      expect(validateField(phoneSchema, "+1 (555) 123-4567")).toBeNull();
      expect(validateField(phoneSchema, "555-CALL-NOW")).toBe("Invalid phone format");

      expect(validateField(urlSchema, "https://portfolio.example.com")).toBeNull();
      expect(validateField(urlSchema, "portfolio.example.com/work")).toBeNull();
      expect(validateField(urlSchema, "not a url")).toBe("Invalid URL");

      expect(validateField(linkedinSchema, "https://www.linkedin.com/in/candidate")).toBeNull();
      expect(validateField(linkedinSchema, "https://www.linkedin.com/company/example")).toBe(
        "Should be a LinkedIn profile URL",
      );
    });
  });

  describe("validateRequiredField", () => {
    it("rejects whitespace-only required fields", () => {
      expect(validateRequiredField(nameSchema, " ")).toBe("Name must be at least 2 characters");
      expect(validateRequiredField(requiredEmailSchema, " ")).toBe("Email is required");
    });

    it("trims and accepts valid required values", () => {
      expect(validateRequiredField(nameSchema, " Ada Lovelace ")).toBeNull();
      expect(validateRequiredField(requiredEmailSchema, " ada@example.com ")).toBeNull();
    });
  });

  describe("entry validation", () => {
    it("does not require fields for completely empty experience entries", () => {
      expect(
        validateExperienceEntry({
          company_or_client: "",
          role: "",
          start_date: "",
          end_date: "",
          bullets: ["", "   "],
        }),
      ).toEqual({ company_or_client: null, role: null });
    });

    it("requires company and role when any experience content exists", () => {
      expect(
        validateExperienceEntry({
          company_or_client: "",
          role: "",
          start_date: "Jan 2024",
          end_date: "",
          bullets: [],
        }),
      ).toEqual({
        company_or_client: "Company name is required",
        role: "Job title is required",
      });
    });

    it("does not require fields for completely empty education entries", () => {
      expect(
        validateEducationEntry({
          institution: "",
          degree: "",
          field: "",
          graduation_date: "",
        }),
      ).toEqual({ institution: null, degree: null });
    });

    it("requires institution and degree when any education content exists", () => {
      expect(
        validateEducationEntry({
          institution: "",
          degree: "",
          field: "Computer Science",
          graduation_date: "",
        }),
      ).toEqual({
        institution: "Institution is required",
        degree: "Degree is required",
      });
    });
  });

  describe("ATS guidance helpers", () => {
    it.each(["Jan 2023", "January 2023", "01/2023", "2023", "Present", "Current", ""])(
      "accepts ATS-friendly date format %j",
      (date) => {
        expect(getDateFormatSuggestion(date)).toBeNull();
      },
    );

    it("suggests a preferred format for invalid dates", () => {
      expect(getDateFormatSuggestion("Spring 2023")).toBe(
        "Use 'Jan 2023' or 'Present' for best ATS compatibility",
      );
    });

    it("warns only outside summary length boundaries", () => {
      expect(getSummaryWarning("")).toBeNull();
      expect(getSummaryWarning("Short summary")).toBe("Summary is very short. Aim for 2-3 sentences.");
      expect(getSummaryWarning("a".repeat(50))).toBeNull();
      expect(getSummaryWarning("a".repeat(500))).toBeNull();
      expect(getSummaryWarning("a".repeat(501))).toBe(
        "Summary is quite long. ATS prefers 2-3 concise sentences.",
      );
    });
  });
});
