package schema

// ConfigResponse is the public configuration that GET /config returns.
// It must not contain a secret.
type ConfigResponse struct {
	S3Web PublicS3Web `json:"s3_web"`
}

type PublicS3Web struct {
	BindAddr   string `json:"bind_addr"`
	RootDomain string `json:"root_domain"`
}

type Config struct {
	RPCBindAddr   string `json:"rpc_bind_addr" toml:"rpc_bind_addr"`
	RPCPublicAddr string `json:"rpc_public_addr" toml:"rpc_public_addr"`
	RPCSecret     string `json:"-" toml:"rpc_secret"`
	Admin         Admin  `json:"admin" toml:"admin"`
	S3API         S3API  `json:"s3_api" toml:"s3_api"`
	S3Web         S3Web  `json:"s3_web" toml:"s3_web"`
}

type Admin struct {
	AdminToken   string `json:"-" toml:"admin_token"`
	APIBindAddr  string `json:"api_bind_addr" toml:"api_bind_addr"`
	MetricsToken string `json:"-" toml:"metrics_token"`
}

type S3API struct {
	APIBindAddr string `json:"api_bind_addr" toml:"api_bind_addr"`
	RootDomain  string `json:"root_domain" toml:"root_domain"`
	S3Region    string `json:"s3_region" toml:"s3_region"`
}

type S3Web struct {
	BindAddr   string `json:"bind_addr" toml:"bind_addr"`
	Index      string `json:"index" toml:"index"`
	RootDomain string `json:"root_domain" toml:"root_domain"`
}
