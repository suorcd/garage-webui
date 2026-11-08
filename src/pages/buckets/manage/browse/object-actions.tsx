import { Dropdown } from "react-daisyui";
import {
  DeleteObjectsError,
  DeleteObjectsResult,
  BrowseObject,
} from "./types";
import Button from "@/components/ui/button";
import { DownloadIcon, EllipsisVertical, Share2, Trash } from "lucide-react";
import { useDeleteObject } from "./hooks";
import { useBucketContext } from "../context";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn, handleError } from "@/lib/utils";
import { API_URL } from "@/lib/api";
import { shareDialog } from "./share-dialog";
import { useRef } from "react";

type Props = {
  prefix?: string;
  object: Pick<BrowseObject, "objectKey" | "url">;
  end?: boolean;
};

const ObjectActions = ({ prefix = "", object, end }: Props) => {
  const { bucket, bucketName } = useBucketContext();
  const queryClient = useQueryClient();
  const isDirectory = object.objectKey.endsWith("/");
  const canWrite = bucket.keys.some(
    (key) => key.permissions.write || key.permissions.owner
  );
  // A truncated delete runs again for the same prefix until no objects
  // remain. The counts accumulate across the pages.
  const deletedTotal = useRef(0);
  const failedDeletes = useRef<DeleteObjectsError[]>([]);

  const deleteObject = useDeleteObject(bucket.id, {
    onSuccess: (data) => {
      const result = data as DeleteObjectsResult;
      if (typeof result.deleted === "number") {
        deletedTotal.current += result.deleted;
        failedDeletes.current.push(...(result.errors ?? []));
        if (result.truncated) {
          deleteObject.mutate({
            key: prefix + object.objectKey,
            recursive: isDirectory,
          });
          return;
        }
        const failures = failedDeletes.current;
        if (failures.length > 0) {
          const keys = failures
            .map((error) => error.key)
            .filter(Boolean)
            .slice(0, 3)
            .join(", ");
          toast.warning(
            `Deleted ${deletedTotal.current} objects, but ${failures.length} failed` +
              (keys ? ` (${keys})` : "") +
              "."
          );
        } else {
          toast.success(`Deleted ${deletedTotal.current} objects!`);
        }
      } else {
        toast.success("Object deleted!");
      }
      queryClient.invalidateQueries({ queryKey: ["browse", bucket.id] });
    },
    onError: (error) => {
      if (deletedTotal.current > 0) {
        toast.warning(
          `Deleted ${deletedTotal.current} objects, then the delete failed.`
        );
      }
      handleError(error);
    },
  });

  const onDownload = () => {
    window.open(API_URL + object.url + "?dl=1", "_blank", "noopener,noreferrer");
  };

  const onDelete = () => {
    const objectPath = `${bucketName || bucket.id}/${prefix}${object.objectKey}`;
    if (
      window.confirm(
        isDirectory
          ? `Are you sure you want to delete the directory "${objectPath}" and all of its contents?`
          : `Are you sure you want to delete "${objectPath}"?`
      )
    ) {
      deletedTotal.current = 0;
      failedDeletes.current = [];
      deleteObject.mutate({
        key: prefix + object.objectKey,
        recursive: isDirectory,
      });
    }
  };

  return (
    <td className="!p-0 w-auto">
      <span className="w-full flex flex-row justify-end pr-2">
        {!isDirectory && (
          <Button icon={DownloadIcon} color="ghost" onClick={onDownload} />
        )}

        <Dropdown end vertical={end ? "top" : "bottom"}>
          <Dropdown.Toggle button={false}>
            <Button icon={EllipsisVertical} color="ghost" />
          </Dropdown.Toggle>

          <Dropdown.Menu className="gap-y-1">
            {!isDirectory && (
              <Dropdown.Item
                onClick={() =>
                  shareDialog.open({ key: object.objectKey, prefix })
                }
              >
                <Share2 /> Share
              </Dropdown.Item>
            )}
            <Dropdown.Item
              className={cn(
                "text-error bg-error/10",
                !canWrite && "opacity-50 cursor-not-allowed"
              )}
              aria-disabled={!canWrite}
              onClick={() => {
                if (!canWrite) {
                  toast.error(
                    "A key with write access is required to delete objects."
                  );
                  return;
                }
                onDelete();
              }}
            >
              <Trash /> Delete
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </span>
    </td>
  );
};

export default ObjectActions;
