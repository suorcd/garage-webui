import api from "@/lib/api";
import { encodePath } from "@/lib/utils";
import {
  useInfiniteQuery,
  useMutation,
  UseMutationOptions,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import {
  DeleteObjectResult,
  GetObjectsResult,
  PutObjectPayload,
  UseBrowserObjectOptions,
} from "./types";

// useBrowseObjectsInfinite pages through the object list with the
// backend next token. Each page loads only when the caller asks for it.
// The initial token restores the page the URL names after a refresh.
export const useBrowseObjectsInfinite = (
  bucket: string,
  options?: UseBrowserObjectOptions,
  initialToken?: string
) => {
  // The explicit generics keep the page param typed: without them the
  // result data defaults to InfiniteData with an unknown page param,
  // and the token read from pageParams loses its type.
  return useInfiniteQuery<
    GetObjectsResult,
    Error,
    InfiniteData<GetObjectsResult, string | undefined>,
    QueryKey,
    string | undefined
  >({
    queryKey: ["browse", bucket, options, "pages"],
    queryFn: ({ pageParam }) => {
      const params: UseBrowserObjectOptions = { ...options };
      if (pageParam) {
        params.next = pageParam;
      }
      return api.get<GetObjectsResult>(`/browse/${encodeURIComponent(bucket)}`, { params });
    },
    initialPageParam: initialToken,
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
  });
};

export const usePutObject = (
  bucket: string,
  options?: UseMutationOptions<unknown, Error, PutObjectPayload>
) => {
  return useMutation({
    mutationFn: async (body) => {
      const formData = new FormData();
      if (body.file) {
        formData.append("file", body.file);
      }

      return api.put(
        `/browse/${encodeURIComponent(bucket)}/${encodePath(body.key)}`,
        { body: formData }
      );
    },
    ...options,
  });
};

export const useDeleteObject = (
  bucket: string,
  options?: UseMutationOptions<
    DeleteObjectResult,
    Error,
    { key: string; recursive?: boolean }
  >
) => {
  return useMutation({
    mutationFn: (data) =>
      api.delete<DeleteObjectResult>(
        `/browse/${encodeURIComponent(bucket)}/${encodePath(data.key)}`,
        {
          params: { recursive: data.recursive },
        }
      ),
    ...options,
  });
};
