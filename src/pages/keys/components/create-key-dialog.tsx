import Button from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Modal } from "react-daisyui";
import { useForm, useWatch } from "react-hook-form";
import { useDisclosure } from "@/hooks/useDisclosure";
import { createKeySchema, CreateKeySchema } from "../schema";
import { InputField } from "@/components/ui/input";
import { CheckboxField } from "@/components/ui/checkbox";
import { useCreateKey } from "../hooks";
import { useQueryClient } from "@tanstack/react-query";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import Code from "@/components/ui/code";

type CreatedKey = {
  accessKeyId: string;
  secretAccessKey: string;
};

const CreateKeyDialog = () => {
  const { dialogRef, isOpen, onOpen, onClose } = useDisclosure();
  const form = useForm<CreateKeySchema>({
    resolver: zodResolver(createKeySchema),
    defaultValues: {
      name: "",
      isImport: false,
      accessKeyId: "",
      secretAccessKey: "",
    },
  });
  const isImport = useWatch({ control: form.control, name: "isImport" });
  const queryClient = useQueryClient();
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);

  useEffect(() => {
    if (isOpen) form.setFocus("name");
  }, [isOpen]);

  // Reset the form when the dialog closes. The effect also covers a close
  // that bypasses React, such as the backdrop form closing the dialog.
  useEffect(() => {
    if (!isOpen) {
      setCreatedKey(null);
      form.reset();
    }
  }, [isOpen, form]);

  // Clear the import fields when the import toggle is switched off, so a
  // later create does not submit stale credentials.
  useEffect(() => {
    if (!isImport) {
      form.resetField("accessKeyId");
      form.resetField("secretAccessKey");
    }
  }, [isImport, form]);

  const handleClose = () => {
    setCreatedKey(null);
    form.reset();
    // Drop the response too: it carries the new secret, and a closed dialog
    // must not keep it in the mutation cache.
    createKey.reset();
    onClose();
  };

  const createKey = useCreateKey({
    onSuccess: (data, values) => {
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      if (values.isImport) {
        toast.success("Key imported!");
        handleClose();
        return;
      }
      const secret = data?.secretAccessKey;
      if (secret) {
        setCreatedKey({
          accessKeyId: data.accessKeyId ?? "",
          secretAccessKey: secret,
        });
        toast.success("Key created!");
        form.reset();
        return;
      }
      toast.success("Key created!");
      handleClose();
    },
    onError: handleError,
  });

  const onSubmit = form.handleSubmit((values) => {
    if (values.isImport) {
      createKey.mutate(values);
      return;
    }
    createKey.mutate({ name: values.name });
  });

  return (
    <>
      <Button icon={Plus} color="primary" onClick={onOpen}>
        Create Key
      </Button>

      <Modal ref={dialogRef} backdrop open={isOpen}>
        <Modal.Header className="mb-1">
          {createdKey ? "Key Created" : "Create New Key"}
        </Modal.Header>
        <Modal.Body>
          {createdKey ? (
            <>
              <p>
                Save the secret access key now. Garage shows it only once.
              </p>
              <p className="label label-text">Access Key ID</p>
              <Code className="break-all">{createdKey.accessKeyId}</Code>
              <p className="label label-text">Secret Access Key</p>
              <Code className="break-all">
                {createdKey.secretAccessKey}
              </Code>
            </>
          ) : (
            <>
              <p>Enter the details of the key you wish to create.</p>

              <form onSubmit={onSubmit}>
                <InputField form={form} name="name" title="Key Name" />
                <CheckboxField
                  form={form}
                  name="isImport"
                  label="Import existing"
                  className="mt-2"
                />

                {isImport && (
                  <>
                    <InputField
                      form={form}
                      name="accessKeyId"
                      title="Access Key ID"
                    />
                    <InputField
                      form={form}
                      name="secretAccessKey"
                      title="Secret Access Key"
                      type="password"
                      autoComplete="off"
                    />
                  </>
                )}
              </form>
            </>
          )}
        </Modal.Body>

        <Modal.Actions>
          {createdKey ? (
            <Button color="primary" onClick={handleClose}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={handleClose} disabled={createKey.isPending}>
                Cancel
              </Button>
              <Button
                color="primary"
                disabled={createKey.isPending}
                onClick={onSubmit}
              >
                Submit
              </Button>
            </>
          )}
        </Modal.Actions>
      </Modal>
    </>
  );
};

export default CreateKeyDialog;
