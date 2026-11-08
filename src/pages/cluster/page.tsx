import Page from "@/context/page-context";
import { useClusterStatus, useNodeInfo } from "./hooks";
import { Alert, Card } from "react-daisyui";
import NodesList from "./components/nodes-list";
import { useMemo } from "react";
import { CircleXIcon } from "lucide-react";
import Button from "@/components/ui/button";
import PageLoading from "@/components/ui/page-loading";

const ClusterPage = () => {
  const {
    data,
    isLoading: statusLoading,
    isError: statusFailed,
    error: statusError,
    refetch: refetchStatus,
  } = useClusterStatus();
  const {
    data: nodeInfo,
    isError: nodeInfoFailed,
    isLoading: nodeInfoLoading,
    error: nodeInfoError,
  } = useNodeInfo();
  const node = nodeInfo?.node;

  const nodes = useMemo(() => {
    if (!data) return [];

    if (Array.isArray(data.knownNodes)) {
      return data.knownNodes.map((node) => ({
        ...node,
        role: data.layout?.roles.find((role) => role.id === node.id),
      }));
    }

    return data.nodes || [];
  }, [data]);

  return (
    <div className="container">
      <Page title="Cluster" />

      <Card>
        <Card.Body className="gap-1">
          <Card.Title className="mb-2">Details</Card.Title>

          {nodeInfoLoading ? (
            <PageLoading />
          ) : (
            <>
              {(nodeInfo?.error != null || nodeInfoFailed) && (
                <Alert status="error" icon={<CircleXIcon />}>
                  <span>
                    Node info error: {nodeInfo?.error || nodeInfoError?.message}
                  </span>
                </Alert>
              )}

              <DetailItem title="Node ID" value={node?.nodeId} />
              <DetailItem
                title="Garage Version"
                value={node?.garageVersion}
              />
              <DetailItem title="Rust version" value={node?.rustVersion} />
              <DetailItem title="DB engine" value={node?.dbEngine} />
              <DetailItem
                title="Layout version"
                value={data?.layoutVersion || data?.layout?.version || "-"}
              />
            </>
          )}
        </Card.Body>
      </Card>

      <Card className="mt-4 md:mt-8">
        <Card.Body>
          <Card.Title>Nodes</Card.Title>

          {statusLoading ? (
            <PageLoading />
          ) : statusFailed ? (
            <Alert status="error" icon={<CircleXIcon />}>
              <span>{statusError?.message}</span>
              <Button onClick={() => refetchStatus()}>Retry</Button>
            </Alert>
          ) : (
            <NodesList nodes={nodes} />
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

type DetailItemProps = {
  title: string;
  value?: string | number | null;
};

const DetailItem = ({ title, value }: DetailItemProps) => {
  return (
    <div className="flex flex-row items-start max-w-xl gap-3 text-left text-sm">
      <div className="shrink-0 w-1/3 max-w-[200px]">
        <p className="text-base-content/80">{title}</p>
      </div>
      <div className="flex-1 truncate">
        <p className="truncate">{value}</p>
      </div>
    </div>
  );
};

export default ClusterPage;
