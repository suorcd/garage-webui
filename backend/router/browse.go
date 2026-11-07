package router

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"io"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
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

const (
	browseDefaultLimit = 100
	browseMaxLimit     = 1000
)

func (b *Browse) GetObjects(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	bucket := r.PathValue("bucket")
	prefix := query.Get("prefix")
	continuationToken := query.Get("next")

	limit := browseDefaultLimit
	if raw := query.Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			utils.ResponseErrorStatus(w, fmt.Errorf("limit must be a number from 1 to %d", browseMaxLimit), http.StatusBadRequest)
			return
		}
		limit = max(1, min(parsed, browseMaxLimit))
	}

	client, access, err := getS3Client(bucket, false)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}
	s3Bucket := access.S3Bucket

	input := &s3.ListObjectsV2Input{
		Bucket:    aws.String(s3Bucket),
		Prefix:    aws.String(prefix),
		Delimiter: aws.String("/"),
		MaxKeys:   aws.Int32(int32(limit)),
	}
	if continuationToken != "" {
		input.ContinuationToken = aws.String(continuationToken)
	}

	objects, err := client.ListObjectsV2(context.Background(), input)

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

	for _, commonPrefix := range objects.CommonPrefixes {
		if commonPrefix.Prefix == nil {
			continue
		}
		result.Prefixes = append(result.Prefixes, *commonPrefix.Prefix)
	}

	for _, object := range objects.Contents {
		if object.Key == nil {
			continue
		}
		key := strings.TrimPrefix(*object.Key, prefix)
		if key == "" {
			continue
		}

		result.Objects = append(result.Objects, schema.BrowserObject{
			ObjectKey:    &key,
			LastModified: object.LastModified,
			Size:         object.Size,
			Url:          browseObjectURL(bucket, *object.Key),
		})
	}

	utils.ResponseSuccess(w, result)
}

// browseObjectURL escapes each path segment, so keys with spaces, ?, #,
// or non-ASCII characters keep working as links.
func browseObjectURL(bucket, key string) string {
	segments := strings.Split(key, "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}
	return fmt.Sprintf("/browse/%s/%s", url.PathEscape(bucket), strings.Join(segments, "/"))
}

func (b *Browse) GetOneObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	queryParams := r.URL.Query()
	view := queryParams.Get("view") == "1"
	thumbnail := queryParams.Get("thumb") == "1"
	download := queryParams.Get("dl") == "1"

	client, access, err := getS3Client(bucket, false)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}
	s3Bucket := access.S3Bucket

	if thumbnail {
		writeThumbnail(w, r.Context(), client, s3Bucket, key)
		return
	}

	if !view && !download {
		object, err := client.HeadObject(context.Background(), &s3.HeadObjectInput{
			Bucket: aws.String(s3Bucket),
			Key:    aws.String(key),
		})
		if err != nil {
			utils.ResponseError(w, err)
			return
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
	filename := keys[len(keys)-1]

	contentType := "application/octet-stream"
	if object.ContentType != nil {
		contentType = *object.ContentType
	}

	if download || !isSafeInlineContentType(contentType) {
		w.Header().Set("Content-Disposition", contentDisposition(filename))
	}

	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("Content-Security-Policy", "sandbox")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if object.LastModified != nil {
		w.Header().Set("Last-Modified", object.LastModified.Format(time.RFC1123))
	}
	w.Header().Set("Content-Type", contentType)
	if object.ContentLength != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(*object.ContentLength, 10))
	}
	if object.ETag != nil {
		w.Header().Set("Etag", *object.ETag)
	}

	_, err = io.Copy(w, object.Body)

	if err != nil {
		log.Printf("GetOneObject: cannot copy object body: %v", err)
		return
	}
}

// isSafeInlineContentType reports whether an object may be served inline
// in the browser. Only images (except SVG, which can carry script), text
// (except HTML), and PDF are safe. Everything else is served as an
// attachment so it cannot execute in the UI origin.
func isSafeInlineContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}

	mediaType = strings.ToLower(mediaType)

	switch mediaType {
	case "image/svg+xml", "text/html":
		return false
	case "application/pdf":
		return true
	default:
		return strings.HasPrefix(mediaType, "image/") ||
			strings.HasPrefix(mediaType, "text/")
	}
}

const (
	defaultMaxThumbnailSize int64 = 5 << 20
	maxThumbnailPixels      int64 = 16_000_000
)

var thumbnailPlaceholder = []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e5e7eb"/><path d="M18 46l10-12 7 9 5-6 6 9z" fill="#9ca3af"/><circle cx="22" cy="20" r="4" fill="#9ca3af"/></svg>`)

func maxThumbnailSize() int64 {
	value := utils.GetEnv("MAX_THUMBNAIL_SIZE", "")
	if value == "" {
		return defaultMaxThumbnailSize
	}

	size, err := strconv.ParseInt(value, 10, 64)
	if err != nil || size <= 0 {
		return defaultMaxThumbnailSize
	}

	return size
}

func writeThumbnail(w http.ResponseWriter, ctx context.Context, client *s3.Client, bucket, key string) {
	head, err := client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		writeThumbnailError(w, err)
		return
	}

	limit := maxThumbnailSize()
	if head.ContentLength != nil && *head.ContentLength > limit {
		writeThumbnailPlaceholder(w)
		return
	}

	etag := aws.ToString(head.ETag)
	if etag == "" && head.LastModified != nil {
		etag = head.LastModified.String()
	}
	cacheKey := fmt.Sprintf("thumb:%s:%s:%s", bucket, key, etag)
	if cached := utils.Cache.Get(cacheKey); cached != nil {
		if body, ok := cached.([]byte); ok {
			writeThumbnailImage(w, body)
			return
		}
	}

	object, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		writeThumbnailError(w, err)
		return
	}
	defer object.Body.Close()

	body, err := io.ReadAll(io.LimitReader(object.Body, limit+1))
	if err != nil {
		writeThumbnailPlaceholder(w)
		return
	}
	if int64(len(body)) > limit {
		writeThumbnailPlaceholder(w)
		return
	}

	config, _, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil {
		writeThumbnailPlaceholder(w)
		return
	}
	if int64(config.Width)*int64(config.Height) > maxThumbnailPixels {
		writeThumbnailPlaceholder(w)
		return
	}

	thumb, err := utils.CreateThumbnailImage(body, 64, 64)
	if err != nil {
		writeThumbnailPlaceholder(w)
		return
	}

	utils.Cache.Set(cacheKey, thumb, time.Hour)
	writeThumbnailImage(w, thumb)
}

func writeThumbnailError(w http.ResponseWriter, err error) {
	var ae smithy.APIError
	if errors.As(err, &ae) && (ae.ErrorCode() == "NoSuchKey" || ae.ErrorCode() == "NotFound") {
		utils.ResponseErrorStatus(w, err, http.StatusNotFound)
		return
	}

	utils.ResponseError(w, err)
}

func writeThumbnailImage(w http.ResponseWriter, body []byte) {
	w.Header().Set("Content-Type", "image/jpeg")
	w.Write(body)
}

func writeThumbnailPlaceholder(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Write(thumbnailPlaceholder)
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

	client, access, err := getS3Client(bucket, true)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}
	s3Bucket := access.S3Bucket

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

// contentDisposition builds a safe attachment header for a download. It
// strips control characters so a crafted key cannot inject header
// parameters, quotes the ASCII fallback name, and adds an RFC 5987
// filename* for non-ASCII names.
func contentDisposition(filename string) string {
	filename = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, filename)
	ascii := strings.Map(func(r rune) rune {
		if r > 0x7f {
			return '?'
		}
		return r
	}, filename)
	disposition := mime.FormatMediaType("attachment", map[string]string{"filename": ascii})
	if disposition == "" {
		return "attachment"
	}
	if ascii == filename {
		return disposition
	}
	return disposition + "; filename*=UTF-8''" + rfc5987Encode(filename)
}

// rfc5987Encode percent-encodes a name per RFC 5987, keeping only the
// attr-char set unescaped.
func rfc5987Encode(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if isRFC5987AttrChar(c) {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func isRFC5987AttrChar(c byte) bool {
	switch {
	case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9':
		return true
	case c == '!', c == '#', c == '$', c == '&', c == '+', c == '-', c == '.', c == '^', c == '_', c == '`', c == '|', c == '~':
		return true
	}
	return false
}

func (b *Browse) DeleteObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	recursive := r.URL.Query().Get("recursive") == "true"
	isDirectory := strings.HasSuffix(key, "/")

	client, access, err := getS3Client(bucket, true)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}
	s3Bucket := access.S3Bucket

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

func getBucketAccess(identifier string, needWrite bool) (*bucketAccess, error) {
	mode := "read"
	if needWrite {
		mode = "write"
	}

	cacheKey := fmt.Sprintf("key:%s:%s", identifier, mode)
	cacheData := utils.Cache.Get(cacheKey)
	if cacheData != nil {
		return cacheData.(*bucketAccess), nil
	}

	bucket, err := fetchBucketInfo(identifier)
	if err != nil {
		return nil, err
	}

	key, err := selectBucketKey(bucket, needWrite)
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

func selectBucketKey(bucket *schema.Bucket, needWrite bool) (*schema.KeyElement, error) {
	for i := range bucket.Keys {
		permissions := bucket.Keys[i].Permissions
		if needWrite {
			if permissions.Write || permissions.Owner {
				return &bucket.Keys[i], nil
			}
			continue
		}

		if permissions.Read {
			return &bucket.Keys[i], nil
		}
	}

	if needWrite {
		return nil, errors.New("bucket has no key with write or owner access")
	}

	return nil, errors.New("bucket has no key with read access")
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

func getS3Client(identifier string, needWrite bool) (*s3.Client, *bucketAccess, error) {
	access, err := getBucketAccess(identifier, needWrite)
	if err != nil {
		return nil, nil, fmt.Errorf("cannot use bucket %s: %w", identifier, err)
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

	return client, access, nil
}
