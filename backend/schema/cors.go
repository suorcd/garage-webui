package schema

type CORSConfiguration struct {
	Rules []CORSRule `json:"rules"`
}

type CORSRule struct {
	AllowedHeaders []string `json:"allowedHeaders"`
	AllowedMethods []string `json:"allowedMethods"`
	AllowedOrigins []string `json:"allowedOrigins"`
	ExposeHeaders  []string `json:"exposeHeaders,omitempty"`
	MaxAgeSeconds  *int32   `json:"maxAgeSeconds,omitempty"`
	ID             *string  `json:"id,omitempty"`
}
