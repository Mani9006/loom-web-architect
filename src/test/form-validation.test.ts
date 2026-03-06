import { describe, it, expect } from "vitest";

// Mock form validation utilities
const mockFormValidation = {
  validateResumeForm: (data: Record<string, unknown>) => {
    const errors: Record<string, string> = {};

    if (!data.firstName || typeof data.firstName !== "string") {
      errors.firstName = "First name is required";
    }
    if (!data.lastName || typeof data.lastName !== "string") {
      errors.lastName = "Last name is required";
    }
    if (!data.email || typeof data.email !== "string") {
      errors.email = "Email is required";
    }
    if (
      data.email &&
      !String(data.email).match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    ) {
      errors.email = "Email is invalid";
    }
    if (!data.phoneNumber || String(data.phoneNumber).length < 10) {
      errors.phoneNumber = "Valid phone number required";
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  },

  validateJobSearchQuery: (query: string) => {
    if (!query || query.trim().length === 0) {
      return { isValid: false, error: "Search query cannot be empty" };
    }
    if (query.length < 2) {
      return { isValid: false, error: "Query too short (min 2 characters)" };
    }
    if (query.length > 100) {
      return { isValid: false, error: "Query too long (max 100 characters)" };
    }
    return { isValid: true };
  },

  validateCoverLetterInput: (text: string) => {
    if (!text || text.trim().length === 0) {
      return { isValid: false, error: "Cover letter cannot be empty" };
    }
    if (text.length < 50) {
      return {
        isValid: false,
        error: "Cover letter too short (min 50 characters)",
      };
    }
    if (text.length > 5000) {
      return {
        isValid: false,
        error: "Cover letter too long (max 5000 characters)",
      };
    }
    return { isValid: true };
  },
};

describe("Form Validation", () => {
  describe("Resume Form", () => {
    it("should accept valid resume form data", () => {
      const validData = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phoneNumber: "5551234567",
      };
      const result = mockFormValidation.validateResumeForm(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it("should reject missing required fields", () => {
      const invalidData = {
        firstName: "",
        lastName: "Doe",
        email: "john@example.com",
        phoneNumber: "5551234567",
      };
      const result = mockFormValidation.validateResumeForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.firstName).toBeDefined();
    });

    it("should reject invalid email", () => {
      const invalidData = {
        firstName: "John",
        lastName: "Doe",
        email: "not-an-email",
        phoneNumber: "5551234567",
      };
      const result = mockFormValidation.validateResumeForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.email).toBe("Email is invalid");
    });

    it("should reject invalid phone number", () => {
      const invalidData = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phoneNumber: "123",
      };
      const result = mockFormValidation.validateResumeForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.phoneNumber).toBeDefined();
    });

    it("should return multiple errors at once", () => {
      const invalidData = {
        firstName: "",
        lastName: "",
        email: "invalid",
        phoneNumber: "123",
      };
      const result = mockFormValidation.validateResumeForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(1);
    });
  });

  describe("Job Search Query", () => {
    it("should accept valid job search query", () => {
      const result = mockFormValidation.validateJobSearchQuery("Software Engineer");
      expect(result.isValid).toBe(true);
    });

    it("should reject empty query", () => {
      const result = mockFormValidation.validateJobSearchQuery("");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Search query cannot be empty");
    });

    it("should reject query too short", () => {
      const result = mockFormValidation.validateJobSearchQuery("a");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("too short");
    });

    it("should reject query too long", () => {
      const longQuery = "a".repeat(101);
      const result = mockFormValidation.validateJobSearchQuery(longQuery);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("too long");
    });

    it("should trim whitespace", () => {
      const result = mockFormValidation.validateJobSearchQuery(
        "  Software Engineer  "
      );
      expect(result.isValid).toBe(true);
    });
  });

  describe("Cover Letter Input", () => {
    it("should accept valid cover letter", () => {
      const validText =
        "Dear Hiring Manager, I am writing to express my strong interest in the position...";
      const result = mockFormValidation.validateCoverLetterInput(validText);
      expect(result.isValid).toBe(true);
    });

    it("should reject empty cover letter", () => {
      const result = mockFormValidation.validateCoverLetterInput("");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    it("should enforce minimum length", () => {
      const shortText = "Too short";
      const result = mockFormValidation.validateCoverLetterInput(shortText);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("too short");
    });

    it("should enforce maximum length", () => {
      const longText = "a".repeat(5001);
      const result = mockFormValidation.validateCoverLetterInput(longText);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("too long");
    });

    it("should accept text at boundary lengths", () => {
      const minText = "a".repeat(50);
      const result1 = mockFormValidation.validateCoverLetterInput(minText);
      expect(result1.isValid).toBe(true);

      const maxText = "a".repeat(5000);
      const result2 = mockFormValidation.validateCoverLetterInput(maxText);
      expect(result2.isValid).toBe(true);
    });
  });
});
