export type UseBrowserObjectOptions = Partial<{
  prefix: string;
  limit: number;
  next: string;
}>;

export type GetObjectsResult = {
  prefixes: string[];
  objects: Object[];
  prefix: string;
  nextToken: string | null;
  s3Bucket: string;
};

export type Object = {
  objectKey: string;
  lastModified: Date;
  size: number;
  url: string;
};

export type PutObjectPayload = {
  key: string;
  file: File | null;
};

export type DeleteObjectsError = {
  key?: string;
  code?: string;
  message?: string;
};

export type DeleteObjectsResult = {
  deleted: number;
  errors?: DeleteObjectsError[];
  truncated?: boolean;
};

export type DeleteObjectResult = DeleteObjectsResult | Record<string, unknown>;
