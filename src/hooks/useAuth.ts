import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

type AuthResponse = {
  enabled: boolean;
  authenticated: boolean;
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
  };
};
