//

export type GetBucketRes = Bucket[];

export type Bucket = {
  id: string;
  globalAliases: string[];
  localAliases: LocalAlias[];
  websiteAccess: boolean;
  websiteConfig?: WebsiteConfig | null;
  keys: Key[];
  objects: number;
  bytes: number;
  unfinishedUploads: number;
  unfinishedMultipartUploads: number;
  unfinishedMultipartUploadParts: number;
  unfinishedMultipartUploadBytes: number;
  quotas: Quotas;
  error?: string;
};

export type LocalAlias = {
  accessKeyId: string;
  alias: string;
};

export type Key = {
  accessKeyId: string;
  name: string;
  permissions: Permissions;
  bucketLocalAliases: string[];
};

export type Permissions = {
  read: boolean;
  write: boolean;
  owner: boolean;
};

export type WebsiteConfig = {
  indexDocument: string;
  errorDocument: string;
};

export type Quotas = {
  maxSize: number | null;
  maxObjects: number | null;
};

export type CORSRule = {
  allowedHeaders: string[];
  allowedMethods: string[];
  allowedOrigins: string[];
  exposeHeaders?: string[];
  maxAgeSeconds?: number;
  id?: string;
};

export type CORSConfiguration = {
  rules: CORSRule[];
};

export type LifecycleRule = {
  id?: string;
  status: "Enabled" | "Disabled";
  filter?: { prefix?: string };
  expiration?: {
    days?: number;
    date?: string;
    expiredObjectDeleteMarker?: boolean;
  };
  abortIncompleteMultipartUpload?: { daysAfterInitiation?: number };
};

export type LifecycleConfiguration = {
  rules: LifecycleRule[];
};
