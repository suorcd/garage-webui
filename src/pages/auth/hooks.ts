import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { loginSchema } from "./schema";
import api from "@/lib/api";
import { toast } from "sonner";

export const useLogin = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: z.infer<typeof loginSchema>) => {
      return api.post("/auth/login", { body });
    },
    onSuccess: async () => {
      // Wait for the status query before the caller navigates. The cached
      // status still says "unauthenticated", so the target layout would
      // redirect back to the login page until the refetch lands.
      await queryClient.refetchQueries({ queryKey: ["auth"] });
      options?.onSuccess?.();
    },
    onError: (err) => {
      toast.error(err?.message || "Unknown error");
      options?.onError?.(err);
    },
  });
};
