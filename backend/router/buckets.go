package router

import (
	"encoding/json"
	"errors"
	"fmt"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"net/http"
)

type Buckets struct{}

type bucketKeyRequest struct {
	BucketID    string             `json:"bucketId"`
	AccessKeyID string             `json:"accessKeyId"`
	Permissions schema.Permissions `json:"permissions"`
}

func decodeBucketKeyRequest(w http.ResponseWriter, r *http.Request) (bucketKeyRequest, error) {
	var request bucketKeyRequest

	body := http.MaxBytesReader(w, r.Body, 64<<10)
	if err := json.NewDecoder(body).Decode(&request); err != nil {
		return request, fmt.Errorf("invalid JSON body: %w", err)
	}
	if request.BucketID == "" {
		return request, errors.New("bucketId is required")
	}
	if request.AccessKeyID == "" {
		return request, errors.New("accessKeyId is required")
	}
	if !request.Permissions.Read && !request.Permissions.Write && !request.Permissions.Owner {
		return request, errors.New("select at least one permission")
	}

	return request, nil
}

func (b *Buckets) AllowKey(w http.ResponseWriter, r *http.Request) {
	request, err := decodeBucketKeyRequest(w, r)
	if err != nil {
		utils.ResponseErrorStatus(w, err, http.StatusBadRequest)
		return
	}

	body, err := utils.Garage.Fetch("/v2/AllowBucketKey", &utils.FetchOptions{
		Method: http.MethodPost,
		Body:   request,
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	var result interface{}
	if len(body) > 0 {
		if err := json.Unmarshal(body, &result); err != nil {
			utils.ResponseError(w, err)
			return
		}
	}

	utils.ResponseSuccess(w, result)
}

func (b *Buckets) GetAll(w http.ResponseWriter, r *http.Request) {
	body, err := utils.Garage.Fetch("/v2/ListBuckets", &utils.FetchOptions{})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	var buckets []schema.GetBucketsRes
	if err := json.Unmarshal(body, &buckets); err != nil {
		utils.ResponseError(w, err)
		return
	}

	ch := make(chan schema.Bucket, len(buckets))

	for _, bucket := range buckets {
		go func() {
			body, err := utils.Garage.Fetch(fmt.Sprintf("/v2/GetBucketInfo?id=%s", bucket.ID), &utils.FetchOptions{})

			if err != nil {
				ch <- schema.Bucket{ID: bucket.ID, GlobalAliases: bucket.GlobalAliases}
				return
			}

			var data schema.Bucket
			if err := json.Unmarshal(body, &data); err != nil {
				ch <- schema.Bucket{ID: bucket.ID, GlobalAliases: bucket.GlobalAliases}
				return
			}

			data.LocalAliases = bucket.LocalAliases
			ch <- data
		}()
	}

	res := make([]schema.Bucket, 0, len(buckets))
	for i := 0; i < len(buckets); i++ {
		res = append(res, <-ch)
	}

	utils.ResponseSuccess(w, res)
}
