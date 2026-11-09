import { z } from "zod";

export const createFolderSchema = z.object({
  name: z
    .string()
    .min(1, "Folder Name is required")
    // S3 keys allow "=". Partitioned data uses names such as "year=2026".
    .regex(/^[a-zA-Z0-9_=-]+$/, "Folder Name invalid"),
});

export type CreateFolderSchema = z.infer<typeof createFolderSchema>;
