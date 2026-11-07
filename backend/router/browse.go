package router

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type Browse struct{}

func (b *Browse) GetObjects(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	bucket := r.PathValue("bucket")
	prefix := query.Get("prefix")
	continuationToken := query.Get("next")

	limit, err := strconv.Atoi(query.Get("limit"))
	if err != nil {
		limit = 100
	}

	client, s3Bucket, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	objects, err := client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
		Bucket:            aws.String(s3Bucket),
		Prefix:            aws.String(prefix),
		Delimiter:         aws.String("/"),
		MaxKeys:           aws.Int32(int32(limit)),
		ContinuationToken: aws.String(continuationToken),
	})

	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	result := schema.BrowseObjectResult{
		Prefixes:  []string{},
		Objects:   []schema.BrowserObject{},
		Prefix:    prefix,
		NextToken: objects.NextContinuationToken,
		S3Bucket:  s3Bucket,
	}

	for _, prefix := range objects.CommonPrefixes {
		result.Prefixes = append(result.Prefixes, *prefix.Prefix)
	}

	for _, object := range objects.Contents {
		key := strings.TrimPrefix(*object.Key, prefix)
		if key == "" {
			continue
		}

		result.Objects = append(result.Objects, schema.BrowserObject{
			ObjectKey:    &key,
			LastModified: object.LastModified,
			Size:         object.Size,
			Url:          fmt.Sprintf("/browse/%s/%s", bucket, *object.Key),
		})
	}

	utils.ResponseSuccess(w, result)
}

func (b *Browse) GetOneObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	queryParams := r.URL.Query()
	view := queryParams.Get("view") == "1"
	thumbnail := queryParams.Get("thumb") == "1"
	download := queryParams.Get("dl") == "1"

	client, s3Bucket, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	if !view && !download && !thumbnail {
		object, err := client.HeadObject(context.Background(), &s3.HeadObjectInput{
			Bucket: aws.String(s3Bucket),
			Key:    aws.String(key),
		})
		if err != nil {
			utils.ResponseError(w, err)
		}
		utils.ResponseSuccess(w, object)
		return
	}

	object, err := client.GetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(s3Bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		var ae smithy.APIError
		if errors.As(err, &ae) && ae.ErrorCode() == "NoSuchKey" {
			utils.ResponseErrorStatus(w, err, http.StatusNotFound)
			return
		}

		utils.ResponseError(w, err)
		return
	}

	defer object.Body.Close()
	keys := strings.Split(key, "/")

	if download {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", keys[len(keys)-1]))
	} else if thumbnail {
		body, err := io.ReadAll(object.Body)
		if err != nil {
			utils.ResponseError(w, err)
			return
		}

		thumb, err := utils.CreateThumbnailImage(body, 64, 64)
		if err != nil {

			utils.ResponseError(w, err)
			return
		}

		w.Header().Set("Content-Type", "image/png")
		w.Write(thumb)
		return
	}

	w.Header().Set("Cache-Control", "max-age=86400")
	w.Header().Set("Last-Modified", object.LastModified.Format(time.RFC1123))

	if object.ContentType != nil {
		w.Header().Set("Content-Type", *object.ContentType)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	if object.ContentLength != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(*object.ContentLength, 10))
	}
	if object.ETag != nil {
		w.Header().Set("Etag", *object.ETag)
	}

	_, err = io.Copy(w, object.Body)

	if err != nil {
		utils.ResponseError(w, err)
		return
	}
}

const (
	defaultMaxUploadSize int64 = 5 << 30
	uploadPartSize       int64 = 5 << 20
)

func maxUploadSize() int64 {
	value := utils.GetEnv("MAX_UPLOAD_SIZE", "")
	if value == "" {
		return defaultMaxUploadSize
	}

	size, err := strconv.ParseInt(value, 10, 64)
	if err != nil || size <= 0 {
		return defaultMaxUploadSize
	}

	return size
}

func (b *Browse) PutObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	isDirectory := strings.HasSuffix(key, "/")

	client, s3Bucket, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	reader, err := r.MultipartReader()
	if err != nil {
		if isDirectory {
			putEmptyObject(w, r.Context(), client, s3Bucket, key)
			return
		}

		utils.ResponseErrorStatus(w, errors.New("request must use multipart/form-data"), http.StatusBadRequest)
		return
	}

	var file *multipart.Part
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			utils.ResponseErrorStatus(w, fmt.Errorf("cannot read multipart body: %w", err), http.StatusBadRequest)
			return
		}

		if part.FormName() == "file" {
			file = part
			break
		}

		part.Close()
	}

	if file == nil {
		if isDirectory {
			putEmptyObject(w, r.Context(), client, s3Bucket, key)
			return
		}

		utils.ResponseErrorStatus(w, errors.New("multipart field \"file\" is missing"), http.StatusBadRequest)
		return
	}
	defer file.Close()

	putFilePart(w, r.Context(), client, s3Bucket, key, file, maxUploadSize())
}

func putEmptyObject(w http.ResponseWriter, ctx context.Context, client *s3.Client, bucket, key string) {
	result, err := client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(nil),
		ContentLength: aws.Int64(0),
	})
	if err != nil {
		utils.ResponseError(w, fmt.Errorf("cannot put object: %w", err))
		return
	}

	utils.ResponseSuccess(w, result)
}

func putFilePart(w http.ResponseWriter, ctx context.Context, client *s3.Client, bucket, key string, file *multipart.Part, limit int64) {
	contentType := file.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	buffer := make([]byte, uploadPartSize)
	n, readErr := io.ReadFull(file, buffer)
	if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
		utils.ResponseError(w, fmt.Errorf("cannot read upload: %w", readErr))
		return
	}

	total := int64(n)
	if total > limit {
		utils.ResponseErrorStatus(w, uploadTooLargeError(limit), http.StatusRequestEntityTooLarge)
		return
	}

	if readErr == io.EOF || readErr == io.ErrUnexpectedEOF {
		result, err := client.PutObject(ctx, &s3.PutObjectInput{
			Bucket:        aws.String(bucket),
			Key:           aws.String(key),
			Body:          bytes.NewReader(buffer[:n]),
			ContentLength: aws.Int64(total),
			ContentType:   aws.String(contentType),
		})
		if err != nil {
			utils.ResponseError(w, fmt.Errorf("cannot put object: %w", err))
			return
		}

		utils.ResponseSuccess(w, result)
		return
	}

	createResult, err := client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		utils.ResponseError(w, fmt.Errorf("cannot start multipart upload: %w", err))
		return
	}

	uploadID := aws.ToString(createResult.UploadId)
	if uploadID == "" {
		utils.ResponseError(w, errors.New("cannot start multipart upload: empty upload ID"))
		return
	}

	completed := false
	defer func() {
		if completed {
			return
		}

		abortCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		_, _ = client.AbortMultipartUpload(abortCtx, &s3.AbortMultipartUploadInput{
			Bucket:   aws.String(bucket),
			Key:      aws.String(key),
			UploadId: aws.String(uploadID),
		})
	}()

	parts := make([]types.CompletedPart, 0, 8)
	partNumber := int32(1)

	for {
		partResult, err := client.UploadPart(ctx, &s3.UploadPartInput{
			Bucket:        aws.String(bucket),
			Key:           aws.String(key),
			UploadId:      aws.String(uploadID),
			PartNumber:    aws.Int32(partNumber),
			Body:          bytes.NewReader(buffer[:n]),
			ContentLength: aws.Int64(int64(n)),
		})
		if err != nil {
			utils.ResponseError(w, fmt.Errorf("cannot upload part %d: %w", partNumber, err))
			return
		}

		parts = append(parts, types.CompletedPart{
			ETag:       partResult.ETag,
			PartNumber: aws.Int32(partNumber),
		})

		if readErr == io.ErrUnexpectedEOF {
			break
		}

		n, readErr = io.ReadFull(file, buffer)
		if readErr == io.EOF {
			break
		}
		if readErr != nil && readErr != io.ErrUnexpectedEOF {
			utils.ResponseError(w, fmt.Errorf("cannot read upload: %w", readErr))
			return
		}

		total += int64(n)
		if total > limit {
			utils.ResponseErrorStatus(w, uploadTooLargeError(limit), http.StatusRequestEntityTooLarge)
			return
		}
		partNumber++
	}

	result, err := client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: parts,
		},
	})
	if err != nil {
		utils.ResponseError(w, fmt.Errorf("cannot complete multipart upload: %w", err))
		return
	}

	completed = true
	utils.ResponseSuccess(w, result)
}

func uploadTooLargeError(limit int64) error {
	return fmt.Errorf("upload is larger than the %d byte limit", limit)
}

func (b *Browse) DeleteObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	recursive := r.URL.Query().Get("recursive") == "true"
	isDirectory := strings.HasSuffix(key, "/")

	client, s3Bucket, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	// Delete directory and its content
	if isDirectory && recursive {
		result, err := deleteDirectoryObjects(r.Context(), client, s3Bucket, key)
		if err != nil {
			utils.ResponseError(w, err)
			return
		}

		utils.ResponseSuccess(w, result)
		return
	}

	// Delete single object
	res, err := client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(s3Bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		utils.ResponseError(w, fmt.Errorf("cannot delete object: %w", err))
		return
	}

	utils.ResponseSuccess(w, res)
}

const deleteObjectsBatchSize = 1000

func deleteDirectoryObjects(ctx context.Context, client *s3.Client, bucket, prefix string) (schema.DeleteObjectsResult, error) {
	result := schema.DeleteObjectsResult{}
	var continuationToken *string

	for {
		objects, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucket),
			Prefix:            aws.String(prefix),
			MaxKeys:           aws.Int32(deleteObjectsBatchSize),
			ContinuationToken: continuationToken,
		})
		if err != nil {
			return result, fmt.Errorf("cannot list objects: %w", err)
		}

		keys := make([]types.ObjectIdentifier, 0, len(objects.Contents))
		for _, object := range objects.Contents {
			if object.Key == nil {
				continue
			}
			keys = append(keys, types.ObjectIdentifier{Key: object.Key})
		}

		if len(keys) > 0 {
			res, err := client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
				Bucket: aws.String(bucket),
				Delete: &types.Delete{Objects: keys},
			})
			if err != nil {
				return result, fmt.Errorf("cannot delete objects: %w", err)
			}

			result.Deleted += len(keys) - len(res.Errors)
			for _, deleteErr := range res.Errors {
				result.Errors = append(result.Errors, schema.DeleteObjectsError{
					Key:     aws.ToString(deleteErr.Key),
					Code:    aws.ToString(deleteErr.Code),
					Message: aws.ToString(deleteErr.Message),
				})
			}
		}

		if objects.IsTruncated == nil || !*objects.IsTruncated {
			break
		}

		nextToken := objects.NextContinuationToken
		if nextToken == nil || (continuationToken != nil && *nextToken == *continuationToken) {
			break
		}
		continuationToken = nextToken
	}

	return result, nil
}

type bucketAccess struct {
	S3Bucket    string
	Credentials aws.CredentialsProvider
}

func getBucketAccess(identifier string) (*bucketAccess, error) {
	cacheKey := fmt.Sprintf("key:%s", identifier)
	cacheData := utils.Cache.Get(cacheKey)
	if cacheData != nil {
		return cacheData.(*bucketAccess), nil
	}

	bucket, err := fetchBucketInfo(identifier)
	if err != nil {
		return nil, err
	}

	key, err := selectBucketKey(bucket)
	if err != nil {
		return nil, err
	}

	s3Bucket, err := getS3BucketName(bucket, key)
	if err != nil {
		return nil, err
	}

	keyBody, err := utils.Garage.Fetch("/v2/GetKeyInfo", &utils.FetchOptions{
		Params: map[string]string{
			"id":            key.AccessKeyID,
			"showSecretKey": "true",
		},
	})
	if err != nil {
		return nil, err
	}

	var keyData schema.KeyElement
	if err := json.Unmarshal(keyBody, &keyData); err != nil {
		return nil, err
	}

	access := &bucketAccess{
		S3Bucket:    s3Bucket,
		Credentials: credentials.NewStaticCredentialsProvider(keyData.AccessKeyID, keyData.SecretAccessKey, ""),
	}
	utils.Cache.Set(cacheKey, access, time.Hour)

	return access, nil
}

func fetchBucketInfo(identifier string) (*schema.Bucket, error) {
	body, err := utils.Garage.Fetch("/v2/GetBucketInfo", &utils.FetchOptions{
		Params: map[string]string{"globalAlias": identifier},
	})
	if err == nil {
		return decodeBucket(body)
	}

	body, err = utils.Garage.Fetch("/v2/GetBucketInfo", &utils.FetchOptions{
		Params: map[string]string{"id": identifier},
	})
	if err == nil {
		return decodeBucket(body)
	}

	bucketID, listErr := findBucketIDByLocalAlias(identifier)
	if listErr != nil {
		return nil, fmt.Errorf("cannot find bucket %q: %w", identifier, listErr)
	}

	body, err = utils.Garage.Fetch("/v2/GetBucketInfo", &utils.FetchOptions{
		Params: map[string]string{"id": bucketID},
	})
	if err != nil {
		return nil, err
	}

	return decodeBucket(body)
}

func findBucketIDByLocalAlias(alias string) (string, error) {
	body, err := utils.Garage.Fetch("/v2/ListBuckets", &utils.FetchOptions{})
	if err != nil {
		return "", err
	}

	var buckets []schema.GetBucketsRes
	if err := json.Unmarshal(body, &buckets); err != nil {
		return "", err
	}

	for _, bucket := range buckets {
		for _, localAlias := range bucket.LocalAliases {
			if localAlias.Alias == alias {
				return bucket.ID, nil
			}
		}
	}

	return "", fmt.Errorf("local alias %q not found", alias)
}

func decodeBucket(body []byte) (*schema.Bucket, error) {
	var bucket schema.Bucket
	if err := json.Unmarshal(body, &bucket); err != nil {
		return nil, err
	}

	return &bucket, nil
}

func selectBucketKey(bucket *schema.Bucket) (*schema.KeyElement, error) {
	for i := range bucket.Keys {
		if bucket.Keys[i].Permissions.Read && bucket.Keys[i].Permissions.Write {
			return &bucket.Keys[i], nil
		}
	}

	return nil, errors.New("bucket has no key with read and write access")
}

func getS3BucketName(bucket *schema.Bucket, key *schema.KeyElement) (string, error) {
	if len(bucket.GlobalAliases) > 0 {
		return bucket.GlobalAliases[0], nil
	}

	if len(key.BucketLocalAliases) > 0 {
		return key.BucketLocalAliases[0], nil
	}

	return "", fmt.Errorf("bucket %s has no global alias and key %s has no local alias", bucket.ID, key.AccessKeyID)
}

func getS3Client(identifier string) (*s3.Client, string, error) {
	access, err := getBucketAccess(identifier)
	if err != nil {
		return nil, "", fmt.Errorf("cannot use bucket %s: %w", identifier, err)
	}

	// Determine endpoint and whether to disable HTTPS
	endpoint := utils.Garage.GetS3Endpoint()
	disableHTTPS := !strings.HasPrefix(endpoint, "https://")

	// AWS config without BaseEndpoint
	awsConfig := aws.Config{
		Credentials: access.Credentials,
		Region:      utils.Garage.GetS3Region(),
	}

	// Build S3 client with custom endpoint resolver for proper signing
	client := s3.NewFromConfig(awsConfig, func(o *s3.Options) {
		o.UsePathStyle = true
		o.EndpointOptions.DisableHTTPS = disableHTTPS
		o.EndpointResolver = s3.EndpointResolverFunc(func(region string, opts s3.EndpointResolverOptions) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:           endpoint,
				SigningRegion: utils.Garage.GetS3Region(),
			}, nil
		})
	})

	return client, access.S3Bucket, nil
}
