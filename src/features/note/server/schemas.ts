import { z } from "zod";

export const noteIdSchema = z.object({
  id: z.string().trim().min(1, "note id is required"),
});

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, "title is required").optional(),
  rawContent: z.string().optional(),
});

export const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1, "title is required").optional(),
    rawContent: z.string().optional(),
    status: z.enum(["pending", "parsed", "uploaded"]).optional(),
    activeStatus: z.enum(["active", "disabled"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
