export type UseBrowserObjectOptions = Partial<{
  prefix: string;
  limit: number;
  next: string;
}>;

export type GetObjectsResult = {
  prefixes: string[];
  objects: BrowseObject[];
  prefix: string;
  nextToken: string | null;
  s3Bucket: string;
};

export type BrowseObject = {
  objectKey: string | null;
  lastModified: string;
  size: number | null;
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

// The single-object delete returns the S3 DeleteObjectOutput unchanged.
// The SDK fields keep their Go names in the JSON.
export type DeleteObjectOutput = {
  DeleteMarker?: boolean | null;
  RequestCharged?: string;
  VersionId?: string | null;
};

export type DeleteObjectResult = DeleteObjectsResult | DeleteObjectOutput;

export const isDeleteObjectsResult = (
  result: DeleteObjectResult
): result is DeleteObjectsResult =>
  "deleted" in result && typeof result.deleted === "number";
