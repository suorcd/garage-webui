package schema

import "time"

type BrowseObjectResult struct {
	Prefixes  []string        `json:"prefixes"`
	Objects   []BrowserObject `json:"objects"`
	Prefix    string          `json:"prefix"`
	NextToken *string         `json:"nextToken"`
	S3Bucket  string          `json:"s3Bucket"`
}

type BrowserObject struct {
	ObjectKey    *string    `json:"objectKey"`
	LastModified *time.Time `json:"lastModified"`
	Size         *int64     `json:"size"`
	Url          string     `json:"url"`
}

type DeleteObjectsResult struct {
	Deleted int                  `json:"deleted"`
	Errors  []DeleteObjectsError `json:"errors,omitempty"`
	// Truncated reports that objects remain after a capped recursive delete.
	// The caller repeats the request to delete the rest.
	Truncated bool `json:"truncated,omitempty"`
}

type DeleteObjectsError struct {
	Key     string `json:"key,omitempty"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}
