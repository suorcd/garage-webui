//

export type GetHealthResult = {
  status: string;
  knownNodes: number;
  connectedNodes: number;
  storageNodes: number;
  storageNodesUp?: number;
  storageNodesOk?: number;
  partitions: number;
  partitionsQuorum: number;
  partitionsAllOk: number;
};
