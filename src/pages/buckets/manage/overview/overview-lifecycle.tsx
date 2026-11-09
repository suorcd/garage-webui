import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loading } from "react-daisyui";
import { toast } from "sonner";
import api from "@/lib/api";
import { handleError } from "@/lib/utils";
import Button from "@/components/ui/button";
import { useBucketContext } from "../context";
import { LifecycleConfiguration } from "../../types";

const LifecycleSection = () => {
  const { bucket } = useBucketContext();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const canRead =
    bucket.keys?.some((key) => key.permissions.read) ?? false;
  const canWrite =
    bucket.keys?.some(
      (key) => key.permissions.write || key.permissions.owner
    ) ?? false;

  const query = useQuery({
    queryKey: ["bucket-lifecycle", bucket.id],
    queryFn: () =>
      api.get<LifecycleConfiguration>(
        `/buckets/${encodeURIComponent(bucket.id)}/lifecycle`
      ),
    enabled: canRead,
  });

  useEffect(() => {
    if (query.data) {
      setText(JSON.stringify(query.data, null, 2));
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: (config: LifecycleConfiguration) =>
      api.put(`/buckets/${encodeURIComponent(bucket.id)}/lifecycle`, {
        body: config,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["bucket-lifecycle", bucket.id],
      });
      toast.success("Lifecycle saved!");
    },
    onError: handleError,
  });

  const remove = useMutation({
    mutationFn: () =>
      api.delete(`/buckets/${encodeURIComponent(bucket.id)}/lifecycle`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["bucket-lifecycle", bucket.id],
      });
      toast.success("Lifecycle removed!");
    },
    onError: handleError,
  });

  const onSave = () => {
    try {
      const parsed = JSON.parse(text) as LifecycleConfiguration;
      if (!Array.isArray(parsed.rules)) {
        throw new Error("The JSON must hold a rules array.");
      }
      save.mutate(parsed);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const onRemove = () => {
    if (window.confirm("Remove all lifecycle rules?")) {
      remove.mutate();
    }
  };

  if (!canRead) {
    return (
      <div className="mt-8 w-full">
        <p className="font-medium">Lifecycle</p>
        <p className="text-sm text-base-content/60 mt-1">
          Grant read access to a key to view lifecycle rules.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full">
      <p className="font-medium">Lifecycle</p>
      <p className="text-sm text-base-content/60">
        Edit the lifecycle rules as JSON. Garage supports expiration and
        abort-incomplete-multipart-upload rules.
      </p>

      {query.isLoading ? (
        <Loading className="mt-2" />
      ) : query.isError ? (
        <p className="text-sm text-error mt-2">{query.error.message}</p>
      ) : (
        <textarea
          className="textarea textarea-bordered w-full h-48 font-mono text-xs mt-2"
          aria-label="Lifecycle rules JSON"
          value={text}
          readOnly={!canWrite}
          onChange={(event) => setText(event.target.value)}
        />
      )}

      <div className="flex flex-row flex-wrap gap-2 mt-2">
        <Button
          color="primary"
          onClick={onSave}
          disabled={!canWrite || query.isLoading || save.isPending}
          loading={save.isPending}
        >
          Save lifecycle
        </Button>
        <Button
          onClick={onRemove}
          disabled={!canWrite || query.isLoading || remove.isPending}
          loading={remove.isPending}
        >
          Remove lifecycle
        </Button>
      </div>
    </div>
  );
};

export default LifecycleSection;
