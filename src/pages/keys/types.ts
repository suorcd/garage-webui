//

export type Key = {
  id: string;
  name: string;
  created?: string;
  expiration?: string | null;
  expired?: boolean;
};

// Garage returns a GetKeyInfoResponse when a key is created. The secret
// access key is present only on creation.
export type CreateKeyResponse = {
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
};
