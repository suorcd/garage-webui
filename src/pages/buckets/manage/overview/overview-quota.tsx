import { DeepPartial, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QuotaSchema, quotaSchema } from "../schema";
import { useEffect } from "react";
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
  });

  useEffect(() => {
    form.reset({
      enabled:
        data?.quotas?.maxSize != null || data?.quotas?.maxObjects != null,
      maxSize: data?.quotas?.maxSize ? data?.quotas?.maxSize / 1024 ** 3 : null,
      maxObjects: data?.quotas?.maxObjects || null,
    });

    const { unsubscribe } = form.watch((values) => onChange(values));
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
    </div>
  );
};

export default QuotaSection;
