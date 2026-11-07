export type Config = {
  s3_web?: S3Web;
};

export type S3Web = {
  bind_addr: string;
  root_domain: string;
};
