import { z } from "zod";

// Garage rejects a global alias that parses as an IPv4 address. Match the
// Rust parse: no leading zeros, each octet from 0 to 255.
const isIPv4Address = (name: string): boolean => {
  const parts = name.split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (part) => /^(0|[1-9][0-9]*)$/.test(part) && Number(part) <= 255
  );
};

export const createBucketSchema = z.object({
  globalAlias: z
    .string()
    .trim()
    .min(1, "Bucket Name is required")
    .min(3, "Bucket Name must be 3 to 63 characters long")
    .max(63, "Bucket Name must be 3 to 63 characters long")
    .regex(
      /^[a-z0-9.-]+$/,
      "Bucket Name must use only lowercase letters, numbers, periods, and hyphens"
    )
    .refine(
      (name) => /^[a-z0-9]/.test(name) && /[a-z0-9]$/.test(name),
      "Bucket Name must start and end with a letter or number"
    )
    .refine(
      (name) => !name.includes(".."),
      "Bucket Name must not contain two periods in a row"
    )
    .refine(
      (name) => !isIPv4Address(name),
      "Bucket Name must not be an IP address"
    )
    .refine(
      (name) => !name.startsWith("xn--"),
      'Bucket Name must not start with "xn--"'
    )
    .refine(
      (name) => !name.endsWith("-s3alias"),
      'Bucket Name must not end with "-s3alias"'
    ),
});

export type CreateBucketSchema = z.infer<typeof createBucketSchema>;
