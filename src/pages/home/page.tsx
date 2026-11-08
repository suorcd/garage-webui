import Page from "@/context/page-context";
import { useNodesHealth } from "./hooks";
import StatsCard from "./components/stats-card";
import {
  Database,
  DatabaseZap,
  FileBox,
  FileCheck,
  FileClock,
  HardDrive,
  HardDriveUpload,
  Leaf,
  PieChart,
} from "lucide-react";
import { cn, readableBytes, ucfirst } from "@/lib/utils";
import { useBuckets } from "../buckets/hooks";
import { useMemo } from "react";
import { Alert } from "react-daisyui";
import { CircleXIcon } from "lucide-react";
import Button from "@/components/ui/button";
import PageLoading from "@/components/ui/page-loading";

const HomePage = () => {
  const {
    data: health,
    isLoading: healthLoading,
    isError: healthFailed,
    error: healthError,
    refetch: refetchHealth,
  } = useNodesHealth();
  const {
    data: buckets,
    isLoading: bucketsLoading,
    isError: bucketsFailed,
    error: bucketsError,
    refetch: refetchBuckets,
  } = useBuckets();

  const totalUsage = useMemo(() => {
    return buckets?.reduce((acc, bucket) => acc + bucket.bytes, 0);
  }, [buckets]);

  const isLoading = healthLoading || bucketsLoading;
  const isError = healthFailed || bucketsFailed;
  const error = healthError || bucketsError;

  const retry = () => {
    refetchHealth();
    refetchBuckets();
  };

  return (
    <div className="container">
      <Page title="Dashboard" />

      {isLoading && <PageLoading />}

      {isError && (
        <Alert status="error" icon={<CircleXIcon />}>
          <span>{error?.message}</span>
          <Button onClick={retry}>Retry</Button>
        </Alert>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <StatsCard
          title="Status"
          icon={Leaf}
          value={health?.status ? ucfirst(health.status) : undefined}
          valueClassName={cn(
            "text-lg",
            health?.status === "healthy"
              ? "text-success"
              : health?.status === "degraded"
                ? "text-warning"
                : health?.status
                  ? "text-error"
                  : undefined
          )}
        />
        <StatsCard title="Nodes" icon={HardDrive} value={health?.knownNodes} />
        <StatsCard
          title="Connected Nodes"
          icon={HardDriveUpload}
          value={health?.connectedNodes}
        />
        <StatsCard
          title="Storage Nodes"
          icon={Database}
          value={health?.storageNodes}
        />
        <StatsCard
          title="Active Storage Nodes"
          icon={DatabaseZap}
          value={health?.storageNodesUp}
        />
        <StatsCard
          title="Partitions"
          icon={FileBox}
          value={health?.partitions}
        />
        <StatsCard
          title="Partitions Quorum"
          icon={FileClock}
          value={health?.partitionsQuorum}
        />
        <StatsCard
          title="Active Partitions"
          icon={FileCheck}
          value={health?.partitionsAllOk}
        />
        <StatsCard
          title="Total Usage"
          icon={PieChart}
          value={readableBytes(totalUsage)}
        />
      </section>
    </div>
  );
};

export default HomePage;
