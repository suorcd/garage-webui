import { DeepPartial, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QuotaSchema, quotaSchema } from "../schema";
import { useEffect, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useUpdateBucket } from "../hooks";
import { InputField } from "@/components/ui/input";
import { ToggleField } from "@/components/ui/toggle";
import { useBucketContext } from "../context";

const QuotaSection = () => {
  const { bucket: data } = useBucketContext();

  const form = useForm<QuotaSchema>({
    resolver: zodResolver(quotaSchema),
    mode: "onChange",
  });
  const isEnabled = useWatch({ control: form.control, name: "enabled" });

  const updateMutation = useUpdateBucket(data?.id);

  const onChange = useDebounce((values: DeepPartial<QuotaSchema>) => {
    // Skip the save when a quota value is invalid. Without this check the
    // save below would send null, and a negative value would clear the
    // quota instead of showing an error.
    const parsed = quotaSchema.safeParse(values);
    if (!parsed.success) {
      // Turning quotas off must still clear them. A leftover invalid value
      // fails the schema, and a skipped save would leave the quota on the
      // server while the toggle shows it off.
      if (values.enabled === false) {
        updateMutation.mutate({
          quotas: { maxObjects: null, maxSize: null },
        });
      }
      return;
    }

    const { enabled, maxObjects, maxSize } = parsed.data;
    const data = {
      maxObjects: enabled && maxObjects != null ? maxObjects : null,
      maxSize:
        enabled && maxSize != null ? Math.round(maxSize * 1024 ** 3) : null,
    };

    updateMutation.mutate({ quotas: data });
  }, 500, { flushOnUnmount: true });

  const wasEnabledRef = useRef<boolean | undefined>(undefined);
  const skipSaveRef = useRef(false);
  // Reading formState.isDirty inside an effect is not reliable under every
  // validation mode, so track the user's edits directly.
  const editedRef = useRef(false);

  // A save that landed makes the form equal to the server, so the section may
  // adopt server state again. Without this it stays pinned to the first load
  // for the life of the mount.
  useEffect(() => {
    if (!updateMutation.isSuccess) return;
    skipSaveRef.current = true;
    form.reset(form.getValues());
    skipSaveRef.current = false;
    editedRef.current = false;
  }, [updateMutation.isSuccess, form]);

  useEffect(() => {
    if (!editedRef.current) {
      form.reset({
        enabled:
          data?.quotas?.maxSize != null || data?.quotas?.maxObjects != null,
        maxSize: data?.quotas?.maxSize
          ? data?.quotas?.maxSize / 1024 ** 3
          : null,
        maxObjects: data?.quotas?.maxObjects || null,
      });
    }
    wasEnabledRef.current = form.getValues("enabled");

    const { unsubscribe } = form.watch((values, { name }) => {
      if (name) {
        editedRef.current = true;
      }

      const wasEnabled = wasEnabledRef.current;
      wasEnabledRef.current = values.enabled;

      if (skipSaveRef.current) {
        return;
      }

      if (
        name === "enabled" &&
        values.enabled === false &&
        wasEnabled === true
      ) {
        if (
          !window.confirm(
            "Turn off quotas? This clears the quota limits on this bucket."
          )
        ) {
          // setValue notifies watch twice, so clear the flag after the
          // call returns instead of letting the first notification
          // consume it.
          skipSaveRef.current = true;
          form.setValue("enabled", true);
          skipSaveRef.current = false;
          return;
        }
      }

      onChange(values);
    });
    return unsubscribe;
  }, [data]);

  return (
    <div className="mt-8">
      <ToggleField form={form} name="enabled" title="Quotas" label="Enabled" />

      {isEnabled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField
            form={form}
            name="maxObjects"
            title="Max Objects"
            type="number"
          />

          <InputField
            form={form}
            name="maxSize"
            title="Max Size (GB)"
            type="number"
          />
        </div>
      )}

      {updateMutation.isPending && (
        <p className="text-sm opacity-70">Saving</p>
      )}
      {!updateMutation.isPending && updateMutation.isSuccess && (
        <p className="text-sm opacity-70">Saved</p>
      )}
    </div>
  );
};

export default QuotaSection;
