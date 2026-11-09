package router

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type BucketCORS struct{}

func corsRulesFromS3(rules []types.CORSRule) []schema.CORSRule {
	result := make([]schema.CORSRule, 0, len(rules))
	for _, rule := range rules {
		result = append(result, schema.CORSRule{
			AllowedHeaders: rule.AllowedHeaders,
			AllowedMethods: rule.AllowedMethods,
			AllowedOrigins: rule.AllowedOrigins,
			ExposeHeaders:  rule.ExposeHeaders,
			MaxAgeSeconds:  rule.MaxAgeSeconds,
			ID:             rule.ID,
		})
	}
	return result
}

func corsRulesToS3(rules []schema.CORSRule) []types.CORSRule {
	result := make([]types.CORSRule, 0, len(rules))
	for _, rule := range rules {
		result = append(result, types.CORSRule{
			AllowedHeaders: rule.AllowedHeaders,
			AllowedMethods: rule.AllowedMethods,
			AllowedOrigins: rule.AllowedOrigins,
			ExposeHeaders:  rule.ExposeHeaders,
			MaxAgeSeconds:  rule.MaxAgeSeconds,
			ID:             rule.ID,
		})
	}
	return result
}

func isNoSuchCORSConfiguration(err error) bool {
	var apiError smithy.APIError
	return errors.As(err, &apiError) && apiError.ErrorCode() == "NoSuchCORSConfiguration"
}

func (b *BucketCORS) Get(w http.ResponseWriter, r *http.Request) {
	client, access, err := getS3Client(r.Context(), r.PathValue("bucket"), false)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	result, err := client.GetBucketCors(r.Context(), &s3.GetBucketCorsInput{
		Bucket: aws.String(access.S3Bucket),
	})
	if err != nil {
		if isNoSuchCORSConfiguration(err) {
			utils.ResponseSuccess(w, schema.CORSConfiguration{Rules: []schema.CORSRule{}})
			return
		}
		utils.ResponseError(w, err)
		return
	}

	utils.ResponseSuccess(w, schema.CORSConfiguration{
		Rules: corsRulesFromS3(result.CORSRules),
	})
}

func (b *BucketCORS) Put(w http.ResponseWriter, r *http.Request) {
	var request schema.CORSConfiguration
	body := http.MaxBytesReader(w, r.Body, 64<<10)
	if err := json.NewDecoder(body).Decode(&request); err != nil {
		utils.ResponseErrorStatus(w, fmt.Errorf("invalid JSON body: %w", err), http.StatusBadRequest)
		return
	}
	if len(request.Rules) == 0 {
		utils.ResponseErrorStatus(w, errors.New("at least one CORS rule is required"), http.StatusBadRequest)
		return
	}

	client, access, err := getS3Client(r.Context(), r.PathValue("bucket"), true)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	_, err = client.PutBucketCors(r.Context(), &s3.PutBucketCorsInput{
		Bucket: aws.String(access.S3Bucket),
		CORSConfiguration: &types.CORSConfiguration{
			CORSRules: corsRulesToS3(request.Rules),
		},
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.ResponseSuccess(w, nil)
}

func (b *BucketCORS) Delete(w http.ResponseWriter, r *http.Request) {
	client, access, err := getS3Client(r.Context(), r.PathValue("bucket"), true)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	_, err = client.DeleteBucketCors(r.Context(), &s3.DeleteBucketCorsInput{
		Bucket: aws.String(access.S3Bucket),
	})
	if err != nil && !isNoSuchCORSConfiguration(err) {
		utils.ResponseError(w, err)
		return
	}

	utils.ResponseSuccess(w, nil)
}
