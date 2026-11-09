package schema

type LifecycleConfiguration struct {
	Rules []LifecycleRule `json:"rules"`
}

type LifecycleRule struct {
	ID                             string                                   `json:"id,omitempty"`
	Status                         string                                   `json:"status"`
	Filter                         *LifecycleFilter                         `json:"filter,omitempty"`
	Expiration                     *LifecycleExpiration                     `json:"expiration,omitempty"`
	AbortIncompleteMultipartUpload *LifecycleAbortIncompleteMultipartUpload `json:"abortIncompleteMultipartUpload,omitempty"`
}

type LifecycleFilter struct {
	Prefix string `json:"prefix,omitempty"`
}

type LifecycleExpiration struct {
	Days                      *int32  `json:"days,omitempty"`
	Date                      *string `json:"date,omitempty"`
	ExpiredObjectDeleteMarker *bool   `json:"expiredObjectDeleteMarker,omitempty"`
}

type LifecycleAbortIncompleteMultipartUpload struct {
	DaysAfterInitiation *int32 `json:"daysAfterInitiation,omitempty"`
}
