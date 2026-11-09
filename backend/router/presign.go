package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"khairul169/garage-webui/utils"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type BucketPresign struct{}

type presignRequest struct {
	Key            string `json:"key"`
	ExpiresSeconds int    `json:"expiresSeconds"`
}

type presignResponse struct {
	URL string `json:"url"`
}

func (b *BucketPresign) Post(w http.ResponseWriter, r *http.Request) {
	var request presignRequest
	body := http.MaxBytesReader(w, r.Body, 64<<10)
	if err := json.NewDecoder(body).Decode(&request); err != nil {
		utils.ResponseErrorStatus(w, fmt.Errorf("invalid JSON body: %w", err), http.StatusBadRequest)
		return
	}
	if request.Key == "" {
		utils.ResponseErrorStatus(w, fmt.Errorf("key is required"), http.StatusBadRequest)
		return
	}
	if request.ExpiresSeconds < 1 || request.ExpiresSeconds > 604800 {
		utils.ResponseErrorStatus(w, fmt.Errorf("expiresSeconds must be from 1 to 604800"), http.StatusBadRequest)
		return
	}

	client, access, err := getS3ClientForEndpoint(
		r.Context(),
		r.PathValue("bucket"),
		false,
		utils.Garage.GetS3PublicEndpoint(),
	)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	presigner := s3.NewPresignClient(client)
	result, err := presigner.PresignGetObject(
		r.Context(),
		&s3.GetObjectInput{
			Bucket: aws.String(access.S3Bucket),
			Key:    aws.String(request.Key),
		},
		s3.WithPresignExpires(time.Duration(request.ExpiresSeconds)*time.Second),
	)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.ResponseSuccess(w, presignResponse{URL: result.URL})
}
