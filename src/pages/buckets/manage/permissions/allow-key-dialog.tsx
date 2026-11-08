import Button from "@/components/ui/button";
import { useKeys } from "@/pages/keys/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Checkbox, Modal, Table } from "react-daisyui";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { AllowKeysSchema, allowKeysSchema } from "../schema";
import { createDisclosure } from "@/lib/disclosure";
import { CheckboxField } from "@/components/ui/checkbox";
import { useAllowKey } from "../hooks";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useBucketContext } from "../context";

type Props = {
  currentKeys?: string[];
};

const AllowKeyDialog = ({ currentKeys }: Props) => {
  const { bucket } = useBucketContext();
  const [dialog] = useState(() => createDisclosure());
  const { dialogRef, isOpen } = dialog.use();
  const { data: keys } = useKeys();
  const form = useForm<AllowKeysSchema>({
    resolver: zodResolver(allowKeysSchema),
  });
  const { fields: keyFields } = useFieldArray({
    control: form.control,
    name: "keys",
  });
  const watchedKeys = useWatch({ control: form.control, name: "keys" });
  const queryClient = useQueryClient();

  const allowKey = useAllowKey(bucket.id, {
    onSuccess: () => {
      form.reset();
      dialog.close();
      toast.success("Key allowed!");
      queryClient.invalidateQueries({ queryKey: ["bucket", bucket.id] });
    },
    onError: handleError,
  });

  useEffect(() => {
    if (!isOpen) return;

    const _keys = keys
      ?.filter((key) => !currentKeys?.includes(key.id))
      ?.map((key) => ({
        checked: false,
        keyId: key.id,
        name: key.name,
        read: false,
        write: false,
        owner: false,
      }));

    // Only rebuild the rows when the unallowed key list changes. The
    // parent passes a new currentKeys array on every render, and a blind
    // reset here would wipe permissions the user already ticked.
    const nextIds = _keys?.map((key) => key.keyId) ?? [];
    const currentIds = form.getValues("keys")?.map((key) => key.keyId) ?? [];
    const sameIds =
      currentIds.length === nextIds.length &&
      currentIds.every((id, index) => id === nextIds[index]);
    if (sameIds) return;

    form.setValue("keys", _keys || []);
  }, [keys, currentKeys, isOpen]);

  const onToggleAll = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof AllowKeysSchema["keys"][number]
  ) => {
    const curValues = form.getValues("keys");
    const newValues = curValues.map((item) => ({
      ...item,
      [field]: e.target.checked,
    }));
    form.setValue("keys", newValues);
  };

  const allChecked = (field: "checked" | "read" | "write" | "owner") =>
    (watchedKeys?.length ?? 0) > 0 &&
    watchedKeys.every((key) => key[field]);

  const onSubmit = form.handleSubmit((values) => {
    form.clearErrors("root");

    const data = values.keys
      .filter((key) => key.checked && (key.read || key.write || key.owner))
      .map((key) => ({
        keyId: key.keyId,
        permissions: { read: key.read, write: key.write, owner: key.owner },
      }));

    if (!data.length) {
      form.setError("root", {
        type: "manual",
        message: "Select at least one key and permission.",
      });
      return;
    }

    allowKey.mutate(data);
  });

  return (
    <>
      <Button icon={Plus} color="primary" onClick={() => dialog.open()}>
        Allow Key
      </Button>

      <Modal ref={dialogRef} backdrop open={isOpen} className="max-w-2xl">
        <Modal.Header className="mb-1">Allow Key</Modal.Header>
        <Modal.Body>
          <p>Select one or more keys and the permissions to grant.</p>
          <p className="text-base-content/60 text-sm mt-1">
            Tick at least one permission for each key.
          </p>

          <div className="overflow-x-auto mt-4">
            <Table>
              <Table.Head>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    color="primary"
                    size="sm"
                    checked={allChecked("checked")}
                    onChange={(e) => onToggleAll(e, "checked")}
                  />
                  Key
                </label>
                <label>Local Aliases</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    color="primary"
                    size="sm"
                    checked={allChecked("read")}
                    onChange={(e) => onToggleAll(e, "read")}
                  />
                  Read
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    color="primary"
                    size="sm"
                    checked={allChecked("write")}
                    onChange={(e) => onToggleAll(e, "write")}
                  />
                  Write
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    color="primary"
                    size="sm"
                    checked={allChecked("owner")}
                    onChange={(e) => onToggleAll(e, "owner")}
                  />
                  Owner
                </label>
              </Table.Head>

              <Table.Body>
                {!keyFields.length ? (
                  <tr>
                    <td colSpan={5} className="text-center">
                      No keys found
                    </td>
                  </tr>
                ) : null}
                {keyFields.map((field, index) => {
                  const curKey = bucket.keys.find(
                    (key) => key.accessKeyId === field.keyId
                  );
                  return (
                    <Table.Row key={field.id}>
                      <CheckboxField
                        form={form}
                        name={`keys.${index}.checked`}
                        label={field.name || field.keyId?.substring(0, 8)}
                      />
                      <span>
                        {curKey?.bucketLocalAliases?.join(", ") || "-"}
                      </span>
                      <CheckboxField
                        form={form}
                        name={`keys.${index}.read`}
                        aria-label={`Read ${field.name || field.keyId}`}
                      />
                      <CheckboxField
                        form={form}
                        name={`keys.${index}.write`}
                        aria-label={`Write ${field.name || field.keyId}`}
                      />
                      <CheckboxField
                        form={form}
                        name={`keys.${index}.owner`}
                        aria-label={`Owner ${field.name || field.keyId}`}
                      />
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
          </div>

          {form.formState.errors.root ? (
            <p className="text-error text-sm mt-2">
              {form.formState.errors.root.message}
            </p>
          ) : null}
        </Modal.Body>

        <Modal.Actions>
          <Button onClick={dialog.close}>Cancel</Button>
          <Button
            color="primary"
            disabled={allowKey.isPending}
            onClick={onSubmit}
          >
            Submit
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
};

export default AllowKeyDialog;
