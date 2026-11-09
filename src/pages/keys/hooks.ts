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

export const useKeys = () => {
  return useQuery({
    queryKey: ["keys"],
    queryFn: async () => {
      try {
        return await api.get<Key[]>("/v2/ListKeysInfo");
      } catch (error) {
        // Garage 2.4 has no ListKeysInfo. Fall back to ListKeys, then
        // read each key's permissions from GetKeyInfo without the secret.
        if (error instanceof APIError && error.status === 404) {
          const keys = await api.get<Key[]>("/v2/ListKeys");
          const details = await Promise.allSettled(
            keys.map((key) =>
              api.get<KeyInfoResponse>("/v2/GetKeyInfo", {
                params: { id: key.id },
              })
            )
          );
          return keys.map((key, index) => {
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
