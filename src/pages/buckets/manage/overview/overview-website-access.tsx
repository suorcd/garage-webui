import { DeepPartial, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { websiteConfigSchema, WebsiteConfigSchema } from "../schema";
import { useEffect, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useUpdateBucket } from "../hooks";
import { useConfig } from "@/hooks/useConfig";
import { Info, LinkIcon } from "lucide-react";
import Button from "@/components/ui/button";
import { InputField } from "@/components/ui/input";
import { ToggleField } from "@/components/ui/toggle";
import { useBucketContext } from "../context";

const WebsiteAccessSection = () => {
  const { bucket: data, bucketName } = useBucketContext();
  const { data: config } = useConfig();
  const form = useForm<WebsiteConfigSchema>({
    resolver: zodResolver(websiteConfigSchema),
  });
  const isEnabled = useWatch({ control: form.control, name: "websiteAccess" });

  const websitePort = config?.s3_web?.bind_addr?.split(":").pop() || "80";
  const rootDomain = config?.s3_web?.root_domain;

  const updateMutation = useUpdateBucket(data?.id);

  const onChange = useDebounce((values: DeepPartial<WebsiteConfigSchema>) => {
    const data = {
      enabled: values.websiteAccess ?? false,
      indexDocument: values.websiteAccess
        ? values.websiteConfig?.indexDocument
        : undefined,
      errorDocument: values.websiteAccess
        ? values.websiteConfig?.errorDocument
        : undefined,
    };

    updateMutation.mutate({
      websiteAccess: data,
    });
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
        websiteAccess: data?.websiteAccess,
        websiteConfig: {
          indexDocument: data?.websiteConfig?.indexDocument || "index.html",
          errorDocument: data?.websiteConfig?.errorDocument || "error/400.html",
        },
      });
    }
    wasEnabledRef.current = form.getValues("websiteAccess");

    const { unsubscribe } = form.watch((values, { name }) => {
      if (name) {
        editedRef.current = true;
      }

      const wasEnabled = wasEnabledRef.current;
      wasEnabledRef.current = values.websiteAccess;

      if (skipSaveRef.current) {
        return;
      }

      if (
        name === "websiteAccess" &&
        values.websiteAccess === false &&
        wasEnabled === true
      ) {
        if (
          !window.confirm(
            "Turn off website access? This stops the bucket website."
          )
        ) {
          // setValue notifies watch twice, so clear the flag after the
          // call returns instead of letting the first notification
          // consume it.
          skipSaveRef.current = true;
          form.setValue("websiteAccess", true);
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
      <div className="flex flex-row gap-2">
        <p className="label label-text py-0 grow-0">Website Access</p>
        <Button
          href="https://garagehq.deuxfleurs.fr/documentation/cookbook/exposing-websites"
          target="_blank"
          size="sm"
          shape="circle"
          color="ghost"
        >
          <Info size={16} />
        </Button>
      </div>

      <ToggleField form={form} name="websiteAccess" label="Enabled" />

      {isEnabled && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField
              form={form}
              name="websiteConfig.indexDocument"
              title="Index Document"
            />
            <InputField
              form={form}
              name="websiteConfig.errorDocument"
              title="Error Document"
            />
          </div>

          <div className="mt-4 alert flex flex-row flex-wrap text-sm gap-x-2 gap-y-1">
            {!rootDomain ? (
              <a
                href={`http://${bucketName}`}
                className="inline-flex items-center flex-row gap-2 font-medium hover:link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <LinkIcon size={14} />
                {bucketName}
              </a>
            ) : null}
            {rootDomain ? (
              <>
                <a
                  href={`http://${bucketName}${rootDomain}`}
                  className="inline-flex items-center flex-row gap-2 font-medium hover:link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <LinkIcon size={14} />
                  {bucketName + rootDomain}
                </a>
                <a
                  href={`http://${bucketName}${rootDomain}:${websitePort}`}
                  className="inline-flex items-center flex-row gap-2 font-medium hover:link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <LinkIcon size={14} />
                  {bucketName + rootDomain + ":" + websitePort}
                </a>
              </>
            ) : null}
          </div>
        </>
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

export default WebsiteAccessSection;
