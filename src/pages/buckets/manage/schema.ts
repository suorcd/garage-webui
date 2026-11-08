import { z } from "zod";

export const addAliasSchema = z.object({
  alias: z.string().min(1, "Alias is required"),
});

export type AddAliasSchema = z.infer<typeof addAliasSchema>;

export const websiteConfigSchema = z.object({
  websiteAccess: z.boolean(),
  websiteConfig: z
    .object({ indexDocument: z.string(), errorDocument: z.string() })
    .nullish(),
});

export type WebsiteConfigSchema = z.infer<typeof websiteConfigSchema>;

export const quotaSchema = z.object({
  enabled: z.boolean(),
  // An empty field means no quota, so read it as null before the number
  // check. A zero or negative value is not a quota: it is an error.
  maxObjects: z.preprocess(
    (value) => (value === "" ? null : value),
    z.coerce
      .number()
      .int("Max objects must be a whole number")
      .positive("Max objects must be greater than 0")
      .nullish()
  ),
  maxSize: z.preprocess(
    (value) => (value === "" ? null : value),
    z.coerce.number().positive("Max size must be greater than 0").nullish()
  ),
});

export type QuotaSchema = z.infer<typeof quotaSchema>;

export const allowKeysSchema = z.object({
  keys: z
    .object({
      checked: z.boolean(),
      keyId: z.string(),
      name: z.string(),
      read: z.boolean(),
      write: z.boolean(),
      owner: z.boolean(),
    })
    .array(),
});

export type AllowKeysSchema = z.infer<typeof allowKeysSchema>;
