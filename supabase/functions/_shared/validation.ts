import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export const healthIdSchema = z.string().regex(/^MHC\d{9}$/);

export const pinSchema = z.string().regex(/^\d{6}$/);

export const recordTypeSchema = z.enum([
  "prescription",
  "lab_report",
  "imaging",
  "discharge_summary",
  "vaccination",
  "other",
]);

export const accessTypeSchema = z.enum(["read", "read_write"]);

export const languageSchema = z.enum(["en", "hi", "mr"]);

export const createPatientCardSchema = z.object({
  fullName: z.string().min(2).max(100),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
});

export const setPinSchema = z.object({
  pin: pinSchema,
});

export const requestConsentSchema = {
  // Support both old and new systems
  healthId: { type: "string", optional: true },
  uhid: { type: "string", optional: true },
  accessType: { type: "string", required: true, enum: ["read_only", "read_write"] },
  reason: { type: "string", required: true, minLength: 10, maxLength: 500 },
  expiryHours: { type: "number", optional: true },
};

export const respondConsentSchema = z.object({
  consentId: z.string().uuid(),
  approved: z.boolean(),
  pin: pinSchema.optional(),
});

export const uploadRecordSchema = z.object({
  recordType: recordTypeSchema,
  title: z.string().min(1).max(200),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorName: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const chatTextSchema = z.object({
  message: z.string().min(1).max(2000),
  language: languageSchema.optional(),
});

export function validateRequest(schema: any, data: any) {
  // Ensure at least one ID is provided
  if (!data.healthId && !data.uhid) {
    throw new Error("Either healthId or uhid must be provided");
  }
  
  // Your existing validation logic...
  return data;
}
