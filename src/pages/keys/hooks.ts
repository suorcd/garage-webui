import api, { APIError } from "@/lib/api";
import {
  useMutation,
  UseMutationOptions,
  useQuery,
} from "@tanstack/react-query";
import { CreateKeyResponse, Key } from "./types";
import { CreateKeySchema } from "./schema";

export const useKeys = () => {
  return useQuery({
    queryKey: ["keys"],
    queryFn: async () => {
      try {
        return await api.get<Key[]>("/v2/ListKeysInfo");
      } catch (error) {
        // Garage 2.4 has no ListKeysInfo. Fall back to the key list
        // without permissions. The createBucket readback needs 2.5.
        if (error instanceof APIError && error.status === 404) {
          return api.get<Key[]>("/v2/ListKeys");
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
