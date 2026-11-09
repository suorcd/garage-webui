//

export type GetNodeInfoResult = {
  success: {
    [key: string]: {
      nodeId: string;
      garageVersion: string;
      garageFeatures: string[] | null;
      rustVersion: string;
      dbEngine: string;
    };
  };
  error: Record<string, string>;
};

// GetClusterStatus returns only the layout version and the nodes. The
// node role here is the assigned role: it has no layout node id.
export type GetStatusResult = {
  layoutVersion: number;
  nodes: Node[];
};

export type Node = {
  id: string;
  garageVersion?: string | null;
  role: NodeAssignedRole | null;
  addr: string | null;
  hostname: string | null;
  isUp: boolean;
  lastSeenSecsAgo: number | null;
  draining: boolean;
  dataPartition?: DataPartition;
  metadataPartition?: DataPartition;
  resyncQueueLen?: number;
};

export type DataPartition = {
  available: number;
  total: number;
};

export type NodeAssignedRole = {
  zone: string;
  capacity: number | null;
  tags: string[];
};

// A role in GetClusterLayout. It names the node and adds the computed
// partition counts.
export type LayoutRole = {
  id: string;
  zone: string;
  capacity: number | null;
  tags: string[];
  storedPartitions?: number | null;
  usableCapacity?: number | null;
};

// A staged change is either a removal or a new assigned role.
export type StagedRole =
  | { id: string; remove: true }
  | ({ id: string; remove?: false } & NodeAssignedRole);

export type LayoutParameters = {
  zoneRedundancy: "maximum" | { atLeast: number };
};

export type GetClusterLayoutResult = {
  version: number;
  roles: LayoutRole[];
  parameters: LayoutParameters;
  partitionSize: number;
  stagedRoleChanges: StagedRole[];
  stagedParameters: LayoutParameters | null;
};

export type AssignNodeBody = {
  id: string;
  zone: string;
  capacity: number | null;
  tags: string[];
};

export type ApplyLayoutResult = {
  message: string[];
  layout: GetClusterLayoutResult;
};
