import { z } from "zod";

export const connectNodeSchema = z
  .object({
    nodeId: z.string().min(1, "Node ID is required"),
    address: z.string().trim().optional(),
  })
  .refine(
    (values) =>
      !values.address ||
      (!/\s/.test(values.address) && !values.address.includes("@")),
    {
      message: "Address must be a host or host:port, without spaces or @",
      path: ["address"],
    }
  );

export type ConnectNodeSchema = z.infer<typeof connectNodeSchema>;

export const capacityUnits = ["B", "MB", "GB", "TB"] as const;

// Bytes per capacity unit. The "B" entry keeps sub-1 MB capacities exact:
// without it, parseCapacity returns no unit below 1 MB and the form can
// stage 1500 bytes as 1500 MB when the user picks a unit to repair it.
const capacityUnitBytes: Record<(typeof capacityUnits)[number], number> = {
  B: 1,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
  TB: 1000 ** 4,
};

export const assignNodeSchema = z
  .object({
    nodeId: z.string().min(1, "Node ID is required"),
    zone: z.string().min(1, 'Zone is required, e.g. "dc1"'),
    capacity: z.coerce.number().nullish(),
    capacityUnit: z.enum(capacityUnits),
    isGateway: z.boolean(),
    tags: z.string().min(1).array(),
  })
  .refine(
    (values) => values.isGateway || (values.capacity && values.capacity > 0),
    {
      message: "Capacity required",
      path: ["capacity"],
    }
  );

export type AssignNodeSchema = z.infer<typeof assignNodeSchema>;

export const calculateCapacity = (
  value?: number | null,
  unit?: (typeof capacityUnits)[number]
) => {
  if (!value || !unit) return 0;
  return value * capacityUnitBytes[unit];
};

export const parseCapacity = (value?: number | null) => {
  if (!value) {
    return { value: 0, unit: undefined };
  }

  for (let i = capacityUnits.length - 1; i >= 0; i--) {
    const unit = capacityUnits[i];
    if (value >= capacityUnitBytes[unit]) {
      const unitValue = value / capacityUnitBytes[unit];
      return {
        value: Number(unitValue.toFixed(3)),
        unit,
      };
    }
  }

  return { value, unit: undefined };
};
