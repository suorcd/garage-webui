import { FolderPlus, UploadIcon } from "lucide-react";
import Button from "@/components/ui/button";
import { usePutObject } from "./hooks";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useBucketContext } from "../context";
import { createDisclosure } from "@/lib/disclosure";
import { Modal } from "react-daisyui";
import { createFolderSchema, CreateFolderSchema } from "./schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InputField } from "@/components/ui/input";
import { useEffect, useState } from "react";

type Props = {
  prefix: string;
  canWrite: boolean;
};

type FailedUpload = {
  name: string;
  reason: string;
};

const MAX_FAILED_NAMES = 5;

const failedSummary = (failed: FailedUpload[]) => {
  const shown = failed
    .slice(0, MAX_FAILED_NAMES)
    .map((f) => `${f.name} (${f.reason})`);
  const rest = failed.length - shown.length;
  return rest > 0
    ? `${shown.join(", ")}, and ${rest} more`
    : shown.join(", ");
};

const Actions = ({ prefix, canWrite }: Props) => {
  const { bucket } = useBucketContext();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const putObject = usePutObject(bucket.id);

  const onUploadFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files?.length) {
        return;
      }

      if (files.length > 20) {
        toast.error("You can only upload up to 20 files at a time");
        return;
      }

      setUploading(true);
      const failed: FailedUpload[] = [];
      let succeeded = 0;

      for (const file of files) {
        try {
          await putObject.mutateAsync({ key: prefix + file.name, file });
          succeeded += 1;
        } catch (err) {
          failed.push({
            name: file.name,
            reason: (err as Error)?.message || "Unknown error",
          });
        }
      }

      setUploading(false);

      if (failed.length === 0) {
        toast.success(
          `Uploaded ${succeeded} file${succeeded === 1 ? "" : "s"}.`
        );
      } else if (succeeded > 0) {
        toast.warning(
          `Uploaded ${succeeded} of ${files.length} files. Failed: ${failedSummary(failed)}.`
        );
      } else {
        toast.error(`Upload failed: ${failedSummary(failed)}.`);
      }

      if (succeeded > 0) {
        queryClient.invalidateQueries({ queryKey: ["browse", bucket.id] });
      }
    };

    input.click();
    input.remove();
  };

  return (
    <>
      <CreateFolderAction prefix={prefix} canWrite={canWrite} />
      <Button
        icon={UploadIcon}
        color="ghost"
        title={
          canWrite
            ? "Upload File"
            : "A key with write access is required to upload objects."
        }
        aria-label="Upload file"
        onClick={onUploadFile}
        disabled={!canWrite || uploading}
        loading={uploading}
      />
    </>
  );
};

type CreateFolderActionProps = {
  prefix: string;
  canWrite: boolean;
};

const CreateFolderAction = ({ prefix, canWrite }: CreateFolderActionProps) => {
  const [dialog] = useState(() => createDisclosure());
  const { dialogRef, isOpen } = dialog.use();
  const { bucket } = useBucketContext();
  const queryClient = useQueryClient();

  const form = useForm<CreateFolderSchema>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (isOpen) form.setFocus("name");
  }, [isOpen]);

  // Reset the form when the dialog closes. The effect also covers a close
  // that bypasses React, such as the backdrop form closing the dialog.
  useEffect(() => {
    if (!isOpen) form.reset();
  }, [isOpen, form]);

  const handleClose = () => {
    form.reset();
    dialog.close();
  };

  const createFolder = usePutObject(bucket.id, {
    onSuccess: () => {
      toast.success("Folder created!");
      queryClient.invalidateQueries({ queryKey: ["browse", bucket.id] });
      dialog.close();
      form.reset();
    },
    onError: handleError,
  });

  const onSubmit = form.handleSubmit((values) => {
    createFolder.mutate({ key: `${prefix}${values.name}/`, file: null });
  });

  return (
    <>
      <Button
        icon={FolderPlus}
        color="ghost"
        onClick={() => dialog.open()}
        title={
          canWrite
            ? "Create Folder"
            : "A key with write access is required to create folders."
        }
        aria-label="Create folder"
        disabled={!canWrite}
      />

      <Modal ref={dialogRef} backdrop open={isOpen}>
        <Modal.Header>Create Folder</Modal.Header>

        <Modal.Body>
          <form onSubmit={onSubmit}>
            <InputField form={form} name="name" title="Name" />
          </form>
        </Modal.Body>

        <Modal.Actions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            color="primary"
            onClick={onSubmit}
            disabled={createFolder.isPending}
          >
            Submit
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
};

export default Actions;
