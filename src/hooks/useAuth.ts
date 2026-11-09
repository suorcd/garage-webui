import api from "@/lib/api";
import { QueryClientContext, useQuery } from "@tanstack/react-query";
import { useContext } from "react";

type AuthResponse = {
  enabled: boolean;
  authenticated: boolean;
  username?: string;
  role?: string;
};

export const useAuth = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.get<AuthResponse>("/auth/status"),
    retry: false,
  });
  return {
    isLoading,
    isError,
    error,
    refetch,
    isEnabled: data?.enabled,
    isAuthenticated: data?.authenticated,
    username: data?.username,
    role: data?.role,
    isReadOnly: data?.role === "readonly",
  };
};

// useIsReadOnly reads the cached auth status without starting a new
// request. MainLayout loads the status before it renders a page.
export const useIsReadOnly = () => {
  const queryClient = useContext(QueryClientContext);
  const data = queryClient?.getQueryData<AuthResponse>(["auth"]);
  return data?.role === "readonly";
};
