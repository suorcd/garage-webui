import api from "@/lib/api";
import {
  MutationOptions,
  useMutation,
  UseMutationOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Bucket, Permissions } from "../types";
import { toast } from "sonner";

export type AllowKeyResult = {
  granted: string[];
  failed: { keyId: string; reason: string }[];
};

export const useBucket = (id?: string | null) => {
  return useQuery({
    queryKey: ["bucket", id],
    queryFn: () => api.get<Bucket>("/v2/GetBucketInfo", { params: { id } }),
    enabled: !!id,
  });
};

export const useUpdateBucket = (id?: string | null) => {
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      return api.post<unknown>("/v2/UpdateBucket", {
        params: { id },
        body: values,
      });
    },
  });
};

export const useAddAlias = (
  bucketId?: string | null,
  options?: UseMutationOptions<unknown, Error, string>
) => {
  return useMutation({
    mutationFn: (alias: string) => {
      return api.post("/v2/AddBucketAlias", {
        body: { bucketId, globalAlias: alias },
      });
    },
    ...options,
  });
};

export const useRemoveAlias = (
  bucketId?: string | null,
  options?: UseMutationOptions<unknown, Error, string>
) => {
  return useMutation({
    mutationFn: (alias: string) => {
      return api.post("/v2/RemoveBucketAlias", {
        body: { bucketId, globalAlias: alias },
      });
    },
    ...options,
  });
};

export const useAllowKey = (
  bucketId?: string | null,
  options?: MutationOptions<
    AllowKeyResult,
    Error,
    { keyId: string; permissions: Permissions }[]
  >
) => {
  const queryClient = useQueryClient();

  return useMutation<
    AllowKeyResult,
    Error,
    { keyId: string; permissions: Permissions }[]
  >({
    mutationFn: async (payload) => {
      if (payload.length === 0) {
        throw new Error("Select at least one key and permission.");
      }

      const settled = await Promise.allSettled(
        payload.map((key) =>
          api.post("/v2/AllowBucketKey", {
            body: {
              bucketId,
              accessKeyId: key.keyId,
              permissions: key.permissions,
            },
          })
        )
      );

      const result: AllowKeyResult = { granted: [], failed: [] };
      settled.forEach((entry, index) => {
        if (entry.status === "fulfilled") {
          result.granted.push(payload[index].keyId);
        } else {
          result.failed.push({
            keyId: payload[index].keyId,
            reason: (entry.reason as Error)?.message || "Unknown error",
          });
        }
      });

      if (result.granted.length === 0) {
        const reasons = result.failed
          .map((failure) => `${failure.keyId}: ${failure.reason}`)
          .join("; ");
        throw new Error(
          `Failed to allow ${result.failed.length === 1 ? "key" : "keys"} ${reasons}`
        );
      }

      return result;
    },
    onSuccess: (result, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ["bucket", bucketId] });
      if (result.failed.length > 0) {
        const reasons = result.failed
          .map((failure) => `${failure.keyId}: ${failure.reason}`)
          .join("; ");
        toast.warning(
          `Allowed ${result.granted.length} of ${variables.length} keys. Failed: ${reasons}.`
        );
        // A partial result must not run the caller's success path: the
        // dialog would close and toast a success over this warning, and the
        // failed keys' ticks would be lost.
        return;
      }
      options?.onSuccess?.(result, variables, context);
    },
    onError: (error, variables, context) => {
      options?.onError?.(error, variables, context);
    },
  });
};

export const useDenyKey = (
  bucketId?: string | null,
  options?: MutationOptions<
    unknown,
    Error,
    { keyId: string; permissions: Permissions }
  >
) => {
  return useMutation({
    mutationFn: (payload) => {
      return api.post("/v2/DenyBucketKey", {
        body: {
          bucketId,
          accessKeyId: payload.keyId,
          permissions: payload.permissions,
        },
      });
    },
    ...options,
  });
};

export const useRemoveBucket = (
  options?: MutationOptions<unknown, Error, string>
) => {
  return useMutation({
    mutationFn: (id) => api.post("/v2/DeleteBucket", { params: { id } }),
    ...options,
  });
};
