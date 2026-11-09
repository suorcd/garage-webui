package router

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type BucketLifecycle struct{}

func lifecycleRulesFromS3(rules []types.LifecycleRule) []schema.LifecycleRule {
	result := make([]schema.LifecycleRule, 0, len(rules))
	for _, rule := range rules {
		entry := schema.LifecycleRule{
			ID:     aws.ToString(rule.ID),
			Status: string(rule.Status),
		}
		if rule.Filter != nil {
			if prefix, ok := rule.Filter.(*types.LifecycleRuleFilterMemberPrefix); ok {
				entry.Filter = &schema.LifecycleFilter{Prefix: prefix.Value}
			}
		}
		if rule.Expiration != nil {
			expiration := &schema.LifecycleExpiration{
				Days:                      rule.Expiration.Days,
				ExpiredObjectDeleteMarker: rule.Expiration.ExpiredObjectDeleteMarker,
			}
			if rule.Expiration.Date != nil {
				date := rule.Expiration.Date.UTC().Format(time.RFC3339)
				expiration.Date = &date
			}
			entry.Expiration = expiration
		}
		if rule.AbortIncompleteMultipartUpload != nil {
			entry.AbortIncompleteMultipartUpload = &schema.LifecycleAbortIncompleteMultipartUpload{
				DaysAfterInitiation: rule.AbortIncompleteMultipartUpload.DaysAfterInitiation,
			}
		}
		result = append(result, entry)
	}
	return result
}

func lifecycleRulesToS3(rules []schema.LifecycleRule) ([]types.LifecycleRule, error) {
	result := make([]types.LifecycleRule, 0, len(rules))
	for _, entry := range rules {
		status := types.ExpirationStatus(entry.Status)
		if status != types.ExpirationStatusEnabled && status != types.ExpirationStatusDisabled {
			return nil, fmt.Errorf("rule %q has an invalid status %q", entry.ID, entry.Status)
		}

		var filter types.LifecycleRuleFilter = &types.LifecycleRuleFilterMemberPrefix{Value: ""}
		if entry.Filter != nil {
			filter = &types.LifecycleRuleFilterMemberPrefix{Value: entry.Filter.Prefix}
		}

		rule := types.LifecycleRule{
			ID:     aws.String(entry.ID),
			Status: status,
			Filter: filter,
		}

		if entry.Expiration == nil && entry.AbortIncompleteMultipartUpload == nil {
			return nil, fmt.Errorf("rule %q must set expiration or abortIncompleteMultipartUpload", entry.ID)
		}

		if entry.Expiration != nil {
			if entry.Expiration.Days != nil && *entry.Expiration.Days < 1 {
				return nil, fmt.Errorf("rule %q must set expiration days to at least 1", entry.ID)
			}
			expiration := &types.LifecycleExpiration{
				Days:                      entry.Expiration.Days,
				ExpiredObjectDeleteMarker: entry.Expiration.ExpiredObjectDeleteMarker,
			}
			if entry.Expiration.Date != nil {
				date, err := time.Parse(time.RFC3339, *entry.Expiration.Date)
				if err != nil {
					return nil, fmt.Errorf("rule %q has an invalid expiration date: %w", entry.ID, err)
				}
				expiration.Date = &date
			}
			rule.Expiration = expiration
		}

		if entry.AbortIncompleteMultipartUpload != nil {
			if entry.AbortIncompleteMultipartUpload.DaysAfterInitiation != nil &&
				*entry.AbortIncompleteMultipartUpload.DaysAfterInitiation < 1 {
				return nil, fmt.Errorf("rule %q must set daysAfterInitiation to at least 1", entry.ID)
			}
			rule.AbortIncompleteMultipartUpload = &types.AbortIncompleteMultipartUpload{
				DaysAfterInitiation: entry.AbortIncompleteMultipartUpload.DaysAfterInitiation,
			}
		}

		result = append(result, rule)
	}
	return result, nil
}

func isNoSuchLifecycleConfiguration(err error) bool {
	var apiError smithy.APIError
	return errors.As(err, &apiError) && apiError.ErrorCode() == "NoSuchLifecycleConfiguration"
}

func (b *BucketLifecycle) Get(w http.ResponseWriter, r *http.Request) {
	client, access, err := getS3Client(r.Context(), r.PathValue("bucket"), false)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	result, err := client.GetBucketLifecycleConfiguration(r.Context(), &s3.GetBucketLifecycleConfigurationInput{
		Bucket: aws.String(access.S3Bucket),
	})
	if err != nil {
		if isNoSuchLifecycleConfiguration(err) {
			utils.ResponseSuccess(w, schema.LifecycleConfiguration{Rules: []schema.LifecycleRule{}})
			return
		}
		utils.ResponseError(w, err)
		return
	}

	utils.ResponseSuccess(w, schema.LifecycleConfiguration{
		Rules: lifecycleRulesFromS3(result.Rules),
	})
}

func (b *BucketLifecycle) Put(w http.ResponseWriter, r *http.Request) {
	var request schema.LifecycleConfiguration
	body := http.MaxBytesReader(w, r.Body, 128<<10)
	decoder := json.NewDecoder(body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		utils.ResponseErrorStatus(w, fmt.Errorf("invalid JSON body: %w", err), http.StatusBadRequest)
		return
	}
	if len(request.Rules) == 0 {
		utils.ResponseErrorStatus(w, errors.New("at least one lifecycle rule is required"), http.StatusBadRequest)
		return
	}

	rules, err := lifecycleRulesToS3(request.Rules)
	if err != nil {
		utils.ResponseErrorStatus(w, err, http.StatusBadRequest)
		return
	}

	client, access, err := getS3Client(r.Context(), r.PathValue("bucket"), true)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	_, err = client.PutBucketLifecycleConfiguration(r.Context(), &s3.PutBucketLifecycleConfigurationInput{
		Bucket: aws.String(access.S3Bucket),
		LifecycleConfiguration: &types.BucketLifecycleConfiguration{
			Rules: rules,
		},
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.ResponseSuccess(w, nil)
}

func (b *BucketLifecycle) Delete(w http.ResponseWriter, r *http.Request) {
	client, access, err := getS3Client(r.Context(), r.PathValue("bucket"), true)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	_, err = client.DeleteBucketLifecycle(r.Context(), &s3.DeleteBucketLifecycleInput{
		Bucket: aws.String(access.S3Bucket),
	})
	if err != nil && !isNoSuchLifecycleConfiguration(err) {
		utils.ResponseError(w, err)
		return
	}

	utils.ResponseSuccess(w, nil)
}
