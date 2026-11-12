import api, { APIError } from "@/lib/api";
import {
  useMutation,
  UseMutationOptions,
  useQuery,
} from "@tanstack/react-query";
import { CreateKeyResponse, Key, KeyPermissions } from "./types";
import { CreateKeySchema } from "./schema";

type KeyInfoResponse = {
  permissions?: KeyPermissions;
};

// Garage names the key identifier differently on each list route:
// - ListKeysInfo (Garage 2.5) answers with GetKeyInfoResponse objects, which
//   carry `accessKeyId`.
// - ListKeys (Garage 2.4 and 2.5) answers with ListKeysResponseItem objects,
//   which carry `id`.
// The UI reads `id` everywhere, so both routes go through toKey.
type RawKey = {
  id?: string | null;
  accessKeyId?: string | null;
  name?: string | null;
  created?: string | null;
  expiration?: string | null;
  expired?: boolean | null;
  permissions?: KeyPermissions | null;
};

export const toKey = (raw: RawKey): Key => {
  const id = raw.id ?? raw.accessKeyId;
  if (!id) {
    throw new Error("Garage returned an access key without an identifier");
  }

  return {
    id,
    name: raw.name ?? "",
    created: raw.created ?? undefined,
    expiration: raw.expiration ?? null,
    expired: raw.expired ?? false,
    permissions: raw.permissions ?? undefined,
  };
};

export const useKeys = () => {
  return useQuery({
    queryKey: ["keys"],
    queryFn: async () => {
      try {
        const keys = await api.get<RawKey[]>("/v2/ListKeysInfo");
        return keys.map(toKey);
      } catch (error) {
        // Garage 2.4 has no ListKeysInfo. Fall back to ListKeys, then
        // read each key's permissions from GetKeyInfo without the secret.
        if (error instanceof APIError && error.status === 404) {
          const keys = await api.get<RawKey[]>("/v2/ListKeys");
          const normalisedKeys = keys.map(toKey);
          const details = await Promise.allSettled(
            normalisedKeys.map((key) =>
              api.get<KeyInfoResponse>("/v2/GetKeyInfo", {
                params: { id: key.id },
              })
            )
          );
          return normalisedKeys.map((key, index) => {
            const entry = details[index];
            if (
              entry.status === "fulfilled" &&
              entry.value?.permissions != null
            ) {
              return { ...key, permissions: entry.value.permissions };
            }
            return key;
          });
        }
        throw error;
      }
    },
  });
};

export const useCreateKey = (
  options?: UseMutationOptions<CreateKeyResponse, Error, CreateKeySchema>
) => {
  return useMutation({
    mutationFn: async (body) => {
      const permission = body.createBucket
        ? { createBucket: true }
        : undefined;

      if (body.isImport) {
        const imported = await api.post<CreateKeyResponse>("/v2/ImportKey", {
          body: {
            accessKeyId: body.accessKeyId,
            secretAccessKey: body.secretAccessKey,
            name: body.name,
          },
        });
        if (permission && imported.accessKeyId) {
          await api.post("/v2/UpdateKey", {
            params: { id: imported.accessKeyId },
            body: { allow: permission },
          });
        }
        return imported;
      }

      return api.post<CreateKeyResponse>("/v2/CreateKey", {
        body: {
          name: body.name,
          ...(permission ? { allow: permission } : {}),
        },
      });
    },
    ...options,
  });
};

export type UpdateKeyPayload = {
  id: string;
  createBucket: boolean;
};

export const useUpdateKey = (
  options?: UseMutationOptions<unknown, Error, UpdateKeyPayload>
) => {
  return useMutation({
    mutationFn: ({ id, createBucket }) =>
      api.post("/v2/UpdateKey", {
        params: { id },
        body: createBucket
          ? { allow: { createBucket: true } }
          : { deny: { createBucket: true } },
      }),
    ...options,
  });
};

export const useRemoveKey = (
  options?: UseMutationOptions<unknown, Error, string>
) => {
  return useMutation({
    mutationFn: (id) => api.post("/v2/DeleteKey", { params: { id } }),
    ...options,
  });
};
