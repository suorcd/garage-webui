import Code from "@/components/ui/code";
import { InputField } from "@/components/ui/input";
import { Button, Modal } from "react-daisyui";
import { useConnectNode } from "../hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ConnectNodeSchema, connectNodeSchema } from "../schema";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plug } from "lucide-react";

const ConnectNodeDialog = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  const form = useForm<ConnectNodeSchema>({
    resolver: zodResolver(connectNodeSchema),
    defaultValues: { nodeId: "", address: "" },
  });

  const connectNode = useConnectNode({
    onSuccess() {
      form.reset({ nodeId: "", address: "" });
      handleHide();
      toast.success("Node connected!");
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    onError(err) {
      toast.error(err?.message || "Unknown error");
    },
  });

  const handleShow = useCallback(() => {
    dialogRef.current?.showModal();
  }, [dialogRef]);

  const handleHide = useCallback(() => {
    dialogRef.current?.close();
  }, [dialogRef]);

  const onSubmit = form.handleSubmit((values) => {
    connectNode.mutate(
      values.address ? `${values.nodeId}@${values.address}` : values.nodeId
    );
  });

  return (
    <>
      <Button color="primary" onClick={handleShow}>
        <Plug />
        Connect
      </Button>

      <Modal ref={dialogRef} backdrop>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e);
          }}
        >
          <Modal.Header>Connect Node</Modal.Header>
          <Modal.Body>
            <p>Run this command in your target node to get node id:</p>
            <Code className="mt-2">docker exec garage /garage node id</Code>

            <p className="mt-8">Enter node id:</p>
            <InputField
              form={form}
              name="nodeId"
              placeholder="..."
              inputClassName="w-full"
            />

            <p className="mt-4">Enter node address (optional):</p>
            <InputField
              form={form}
              name="address"
              placeholder="127.0.0.1:3901"
              inputClassName="w-full"
            />
            <p className="mt-2 text-base-content/60">
              Garage uses id@address when the cluster does not know the node
              address yet.
            </p>
          </Modal.Body>
          <Modal.Actions>
            <Button type="button" onClick={handleHide}>
              Cancel
            </Button>
            <Button
              type="submit"
              color="primary"
              disabled={connectNode.isPending}
            >
              Save
            </Button>
          </Modal.Actions>
        </form>
      </Modal>
    </>
  );
};

export default ConnectNodeDialog;
