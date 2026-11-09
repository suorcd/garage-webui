package schema

// KeySecret is the server-only response from GetKeyInfo with the secret.
// Do not return it to the browser.
type KeySecret struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
}
