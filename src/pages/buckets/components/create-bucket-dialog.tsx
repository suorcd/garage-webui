import Button from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Modal } from "react-daisyui";
import { useForm } from "react-hook-form";
import { createDisclosure } from "@/lib/disclosure";
import { createBucketSchema, CreateBucketSchema } from "../schema";
import { InputField } from "@/components/ui/input";
import { useCreateBucket } from "../hooks";
import { useQueryClient } from "@tanstack/react-query";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const CreateBucketDialog = () => {
  const [dialog] = useState(() => createDisclosure());
  const { dialogRef, isOpen } = dialog.use();
  const form = useForm<CreateBucketSchema>({
    resolver: zodResolver(createBucketSchema),
    defaultValues: { globalAlias: "" },
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) form.setFocus("globalAlias");
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

  const createBucket = useCreateBucket({
    onSuccess: () => {
      form.reset();
      dialog.close();
      queryClient.invalidateQueries({ queryKey: ["buckets"] });
      toast.success("Bucket created!");
    },
    onError: handleError,
  });

  const onSubmit = form.handleSubmit((values) => {
    createBucket.mutate(values);
  });

  return (
    <>
      <Button icon={Plus} color="primary" onClick={() => dialog.open()}>
        Create Bucket
      </Button>

      <Modal ref={dialogRef} backdrop open={isOpen}>
        <Modal.Header className="mb-1">Create New Bucket</Modal.Header>
        <Modal.Body>
          <p>Enter the details of the bucket you wish to create.</p>

          <form onSubmit={onSubmit}>
            <InputField form={form} name="globalAlias" title="Bucket Name" />
          </form>
        </Modal.Body>

        <Modal.Actions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            color="primary"
            disabled={createBucket.isPending}
            onClick={onSubmit}
          >
            Submit
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
};

export default CreateBucketDialog;
