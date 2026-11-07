import api from "@/lib/api";
import {
  ApplyLayoutResult,
  AssignNodeBody,
  GetClusterLayoutResult,
  GetNodeInfoResult,
  GetStatusResult,
} from "./types";
import {
  useMutation,
  UseMutationOptions,
  useQuery,
} from "@tanstack/react-query";

type ConnectNodeResponse = {
  success?: Record<string, unknown>;
  error?: string;
};

export const useNodeInfo = () => {
  return useQuery({
    queryKey: ["node-info"],
    queryFn: () =>
      api.get<GetNodeInfoResult>("/v2/GetNodeInfo", {
        params: { node: "self" },
      }),
    select: (data) => ({
      node: data.success?.["self"],
      error: data.error?.["self"],
    }),
  });
};

export const useClusterStatus = () => {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => api.get<GetStatusResult>("/v2/GetClusterStatus"),
  });
};

export const useClusterLayout = () => {
  return useQuery({
    queryKey: ["layout"],
    queryFn: () => api.get<GetClusterLayoutResult>("/v2/GetClusterLayout"),
  });
};

export const useConnectNode = (
  options?: Partial<UseMutationOptions<ConnectNodeResponse, Error, string>>
) => {
  return useMutation<ConnectNodeResponse, Error, string>({
    mutationFn: async (nodeId) => {
      const [res] = await api.post<ConnectNodeResponse[]>(
        "/v2/ConnectClusterNodes",
        {
          body: [nodeId],
        }
      );
      if (!res.success) {
        throw new Error(res.error || "Unknown error");
      }
      return res;
    },
    ...options,
  });
};

export const useAssignNode = (
  options?: Partial<UseMutationOptions<unknown, Error, AssignNodeBody>>
) => {
  return useMutation<unknown, Error, AssignNodeBody>({
    mutationFn: (data) =>
      api.post<unknown>("/v2/UpdateClusterLayout", {
        body: { parameters: null, roles: [data] },
      }),
    ...options,
  });
};

export const useUnassignNode = (
  options?: Partial<UseMutationOptions<unknown, Error, string>>
) => {
  return useMutation<unknown, Error, string>({
    mutationFn: (nodeId) =>
      api.post<unknown>("/v2/UpdateClusterLayout", {
        body: { parameters: null, roles: [{ id: nodeId, remove: true }] },
      }),
    ...options,
  });
};

export const useRevertChanges = (
  options?: Partial<UseMutationOptions<unknown, Error, void>>
) => {
  return useMutation<unknown, Error, void>({
    mutationFn: () => api.post<unknown>("/v2/RevertClusterLayout"),
    ...options,
  });
};

export const useApplyChanges = (
  options?: Partial<UseMutationOptions<ApplyLayoutResult, Error, number>>
) => {
  return useMutation<ApplyLayoutResult, Error, number>({
    mutationFn: (version) =>
      api.post<ApplyLayoutResult>("/v2/ApplyClusterLayout", {
        body: { version },
      }),
    ...options,
  });
};
