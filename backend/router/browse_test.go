package router

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"

	"github.com/aws/aws-sdk-go-v2/credentials"
)

type fakeS3 struct {
	mu               sync.Mutex
	keys             []string
	deletedKeys      []string
	failedKeys       map[string]bool
	listCalls        int
	deleteCalls      int
	contents         map[string][]byte
	contentTypes     map[string]string
	omitLastModified bool
	lastMaxKeys      string
	tokenPresent     bool
	lastToken        string
	nilEntries       int
	nilPrefixes      int
}

type listBucketResult struct {
	XMLName               xml.Name       `xml:"ListBucketResult"`
	Name                  string         `xml:"Name"`
	Prefix                string         `xml:"Prefix"`
	KeyCount              int            `xml:"KeyCount"`
	MaxKeys               int            `xml:"MaxKeys"`
	IsTruncated           bool           `xml:"IsTruncated"`
	NextContinuationToken string         `xml:"NextContinuationToken,omitempty"`
	Contents              []listContents `xml:"Contents"`
	CommonPrefixes        []commonPrefix `xml:"CommonPrefixes"`
}

type commonPrefix struct {
	Prefix string `xml:"Prefix,omitempty"`
}

type listContents struct {
	Key          string `xml:"Key,omitempty"`
	LastModified string `xml:"LastModified,omitempty"`
	ETag         string `xml:"ETag,omitempty"`
	Size         int64  `xml:"Size"`
	StorageClass string `xml:"StorageClass,omitempty"`
}

type deleteRequest struct {
	Objects []deleteObject `xml:"Object"`
}

type deleteObject struct {
	Key string `xml:"Key"`
}

type deleteResult struct {
	XMLName xml.Name          `xml:"DeleteResult"`
	Deleted []deletedObject   `xml:"Deleted"`
	Errors  []deleteErrorItem `xml:"Error"`
}

type deletedObject struct {
	Key string `xml:"Key"`
}

type deleteErrorItem struct {
	Key     string `xml:"Key"`
	Code    string `xml:"Code"`
	Message string `xml:"Message"`
}

func (f *fakeS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodGet && r.URL.Query().Get("list-type") == "2":
		f.handleList(w, r)
	case r.Method == http.MethodGet:
		f.handleGet(w, r)
	case r.Method == http.MethodPost && r.URL.Query().Has("delete"):
		f.handleDelete(w, r)
	case r.Method == http.MethodHead:
		f.handleHead(w, r)
	default:
		http.Error(w, "unexpected request", http.StatusBadRequest)
	}
}

func (f *fakeS3) handleHead(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(r.URL.Path, "/test-bucket/")
	for _, k := range f.keys {
		if k == key {
			w.Header().Set("Content-Length", "0")
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(http.StatusNotFound)
	fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>`)
}

// handleGet serves three suites from one fake: the truncated body from #92,
// the content-type map from #96, and the contents/omitLastModified knobs
// from #103.
func (f *fakeS3) handleGet(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(r.URL.Path, "/")
	key = strings.TrimPrefix(key, "test-bucket/")

	if key == "truncated.txt" {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", "100")
		w.Header().Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("0123456789"))
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	body, ok := f.contents[key]
	contentType, typed := f.contentTypes[key]
	if !ok {
		// #96's tests describe the object by content type only.
		if !typed {
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>not found</Message></Error>`))
			return
		}
		body = []byte("hello")
	}

	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if !f.omitLastModified {
		w.Header().Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (f *fakeS3) handleList(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.listCalls++
	f.lastMaxKeys = r.URL.Query().Get("max-keys")
	_, f.tokenPresent = r.URL.Query()["continuation-token"]
	f.lastToken = r.URL.Query().Get("continuation-token")

	const pageSize = 1000
	start := 0
	if token := r.URL.Query().Get("continuation-token"); token != "" {
		parsed, err := strconv.Atoi(token)
		if err != nil {
			http.Error(w, "invalid continuation token", http.StatusBadRequest)
			return
		}
		start = parsed
	}

	end := start + pageSize
	if end > len(f.keys) {
		end = len(f.keys)
	}
	if start > len(f.keys) {
		start = len(f.keys)
	}

	result := listBucketResult{
		Name:        "test-bucket",
		Prefix:      r.URL.Query().Get("prefix"),
		KeyCount:    end - start,
		MaxKeys:     pageSize,
		IsTruncated: end < len(f.keys),
	}
	if result.IsTruncated {
		result.NextContinuationToken = strconv.Itoa(end)
	}

	for _, key := range f.keys[start:end] {
		result.Contents = append(result.Contents, listContents{
			Key:          key,
			LastModified: time.Now().UTC().Format(time.RFC3339),
			ETag:         `"etag"`,
			Size:         0,
			StorageClass: "STANDARD",
		})
	}
	for i := 0; i < f.nilEntries; i++ {
		result.Contents = append(result.Contents, listContents{})
	}
	for i := 0; i < f.nilPrefixes; i++ {
		result.CommonPrefixes = append(result.CommonPrefixes, commonPrefix{})
	}

	w.Header().Set("Content-Type", "application/xml")
	xml.NewEncoder(w).Encode(result)
}

func (f *fakeS3) handleDelete(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.deleteCalls++

	var req deleteRequest
	if err := xml.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid delete request", http.StatusBadRequest)
		return
	}

	var result deleteResult
	for _, object := range req.Objects {
		if f.failedKeys[object.Key] {
			result.Errors = append(result.Errors, deleteErrorItem{
				Key:     object.Key,
				Code:    "AccessDenied",
				Message: "access denied",
			})
			continue
		}

		f.deletedKeys = append(f.deletedKeys, object.Key)
		result.Deleted = append(result.Deleted, deletedObject{Key: object.Key})
	}

	w.Header().Set("Content-Type", "application/xml")
	xml.NewEncoder(w).Encode(result)
}

func newFakeS3Server(t *testing.T, fake *fakeS3) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(fake)
	t.Cleanup(server.Close)

	t.Setenv("S3_ENDPOINT_URL", server.URL)
	t.Setenv("S3_REGION", "garage")

	utils.InitCacheManager()
	utils.Cache.Set("key:test-bucket:read", &bucketAccess{
		S3Bucket: "test-bucket",
		Credentials: credentials.NewStaticCredentialsProvider(
			"test-access-key",
			"test-secret-key",
			"",
		),
	}, time.Hour)
	utils.Cache.Set("key:test-bucket:write", &bucketAccess{
		S3Bucket: "test-bucket",
		Credentials: credentials.NewStaticCredentialsProvider(
			"test-access-key",
			"test-secret-key",
			"",
		),
	}, time.Hour)

	return server
}

func seedReadBucketAccess(t *testing.T) {
	t.Helper()

	utils.Cache.Set("key:test-bucket:read", &bucketAccess{
		S3Bucket: "test-bucket",
		Credentials: credentials.NewStaticCredentialsProvider(
			"test-access-key",
			"test-secret-key",
			"",
		),
	}, time.Hour)
}

func testBrowseMux() *http.ServeMux {
	mux := http.NewServeMux()
	browse := &Browse{}
	mux.HandleFunc("GET /browse/{bucket}", browse.GetObjects)
	mux.HandleFunc("DELETE /browse/{bucket}/{key...}", browse.DeleteObject)
	mux.HandleFunc("GET /browse/{bucket}/{key...}", browse.GetOneObject)
	return mux
}

func TestGetOneObjectHeadFailureReturnsSingleErrorResponse(t *testing.T) {
	fake := &fakeS3{}
	newFakeS3Server(t, fake)
	seedReadBucketAccess(t)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket/missing.txt", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d: %s", rec.Code, rec.Body.String())
	}

	body := rec.Body.String()
	want := "operation error S3: HeadObject, https response error StatusCode: 404, RequestID: , HostID: , NotFound: "
	if body != want {
		t.Errorf("expected a single error body %q, got %q", want, body)
	}
}

func TestGetOneObjectCopyFailureReturnsOnlyObjectBytes(t *testing.T) {
	fake := &fakeS3{}
	newFakeS3Server(t, fake)
	seedReadBucketAccess(t)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket/truncated.txt?view=1", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != "0123456789" {
		t.Errorf("expected only the object bytes, got %q", got)
	}
}

func TestGetOneObjectViewServesSafeTypesInline(t *testing.T) {
	fake := &fakeS3{
		contentTypes: map[string]string{
			"photo.png":  "image/png",
			"note.txt":   "text/plain",
			"doc.pdf":    "application/pdf",
			"photo2.png": "image/png; charset=binary",
		},
	}
	newFakeS3Server(t, fake)
	seedReadBucketAccess(t)

	for _, key := range []string{"photo.png", "note.txt", "doc.pdf", "photo2.png"} {
		t.Run(key, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket/"+key+"?view=1", nil)
			rec := httptest.NewRecorder()
			testBrowseMux().ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
			}
			if got := rec.Header().Get("Content-Disposition"); got != "" {
				t.Errorf("expected no Content-Disposition for an inline type, got %q", got)
			}
			assertViewSecurityHeaders(t, rec)
		})
	}
}

func TestGetOneObjectViewForcesAttachmentForUnsafeTypes(t *testing.T) {
	fake := &fakeS3{
		contentTypes: map[string]string{
			"page.html":  "text/html",
			"pic.svg":    "image/svg+xml",
			"blob.bin":   "application/octet-stream",
			"page2.html": "text/html; charset=utf-8",
			"PAGE.HTML":  "TEXT/HTML",
		},
	}
	newFakeS3Server(t, fake)
	seedReadBucketAccess(t)

	for _, key := range []string{"page.html", "pic.svg", "blob.bin", "page2.html", "PAGE.HTML"} {
		t.Run(key, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket/"+key+"?view=1", nil)
			rec := httptest.NewRecorder()
			testBrowseMux().ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
			}
			if got := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment") {
				t.Errorf("expected Content-Disposition attachment, got %q", got)
			}
			assertViewSecurityHeaders(t, rec)
		})
	}
}

func TestGetOneObjectDownloadKeepsAttachment(t *testing.T) {
	fake := &fakeS3{
		contentTypes: map[string]string{
			"photo.png": "image/png",
		},
	}
	newFakeS3Server(t, fake)
	seedReadBucketAccess(t)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket/photo.png?dl=1", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment") {
		t.Errorf("expected Content-Disposition attachment, got %q", got)
	}
	assertViewSecurityHeaders(t, rec)
}

func assertViewSecurityHeaders(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()

	if got := rec.Header().Get("Content-Security-Policy"); got != "sandbox" {
		t.Errorf("expected Content-Security-Policy sandbox, got %q", got)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("expected X-Content-Type-Options nosniff, got %q", got)
	}
	if got := rec.Header().Get("Cache-Control"); !strings.Contains(got, "private") {
		t.Errorf("expected Cache-Control to contain private, got %q", got)
	}
}

func TestDeleteObjectRecursiveDeletesAllPages(t *testing.T) {
	keys := make([]string, 1001)
	for i := range keys {
		keys[i] = fmt.Sprintf("dir/object-%04d", i)
	}

	fake := &fakeS3{keys: keys}
	newFakeS3Server(t, fake)

	req := httptest.NewRequest(http.MethodDelete, "/browse/test-bucket/dir/?recursive=true", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var result schema.DeleteObjectsResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}

	if result.Deleted != 1001 {
		t.Errorf("expected 1001 deleted objects, got %d", result.Deleted)
	}
	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got %v", result.Errors)
	}
	if fake.listCalls != 2 {
		t.Errorf("expected 2 list calls, got %d", fake.listCalls)
	}
	if fake.deleteCalls != 2 {
		t.Errorf("expected 2 delete calls, got %d", fake.deleteCalls)
	}
	if len(fake.deletedKeys) != 1001 {
		t.Errorf("expected 1001 keys sent to S3 delete, got %d", len(fake.deletedKeys))
	}
}

func TestDeleteObjectRecursiveReportsPartialFailures(t *testing.T) {
	fake := &fakeS3{
		keys:       []string{"dir/a", "dir/b", "dir/c"},
		failedKeys: map[string]bool{"dir/b": true},
	}
	newFakeS3Server(t, fake)

	req := httptest.NewRequest(http.MethodDelete, "/browse/test-bucket/dir/?recursive=true", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var result schema.DeleteObjectsResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}

	if result.Deleted != 2 {
		t.Errorf("expected 2 deleted objects, got %d", result.Deleted)
	}
	if len(result.Errors) != 1 {
		t.Fatalf("expected 1 error, got %v", result.Errors)
	}
	if result.Errors[0].Key != "dir/b" {
		t.Errorf("expected the failing key to be dir/b, got %q", result.Errors[0].Key)
	}
	if result.Errors[0].Code != "AccessDenied" {
		t.Errorf("expected AccessDenied, got %q", result.Errors[0].Code)
	}
}

func downloadObject(t *testing.T, fake *fakeS3, target string) *httptest.ResponseRecorder {
	t.Helper()

	newFakeS3Server(t, fake)
	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)
	return rec
}

func TestGetOneObjectDownloadQuotesFilename(t *testing.T) {
	fake := &fakeS3{contents: map[string][]byte{"my file.txt": []byte("hello")}}
	rec := downloadObject(t, fake, "/browse/test-bucket/my%20file.txt?dl=1")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Disposition"); got != `attachment; filename="my file.txt"` {
		t.Errorf("expected a quoted filename, got %q", got)
	}
}

func TestGetOneObjectDownloadEncodesNonASCIIFilename(t *testing.T) {
	fake := &fakeS3{contents: map[string][]byte{"café.txt": []byte("hello")}}
	rec := downloadObject(t, fake, "/browse/test-bucket/caf%C3%A9.txt?dl=1")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	disposition := rec.Header().Get("Content-Disposition")
	if !strings.Contains(disposition, "filename*=UTF-8''caf%C3%A9.txt") {
		t.Errorf("expected an RFC 5987 filename, got %q", disposition)
	}
	if !strings.Contains(disposition, "filename=") {
		t.Errorf("expected an ASCII fallback filename, got %q", disposition)
	}
}

func TestGetOneObjectDownloadStripsControlCharacters(t *testing.T) {
	fake := &fakeS3{contents: map[string][]byte{"a\"b\nc.txt": []byte("hello")}}
	rec := downloadObject(t, fake, "/browse/test-bucket/a%22b%0Ac.txt?dl=1")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	disposition := rec.Header().Get("Content-Disposition")
	if strings.ContainsAny(disposition, "\r\n") {
		t.Errorf("expected no CR or LF in the disposition, got %q", disposition)
	}
	if !strings.Contains(disposition, `filename="a\"bc.txt"`) {
		t.Errorf("expected the quote escaped and the newline stripped, got %q", disposition)
	}
}

func TestGetOneObjectDownloadWithoutLastModified(t *testing.T) {
	fake := &fakeS3{
		contents:         map[string][]byte{"a.txt": []byte("hello")},
		omitLastModified: true,
	}
	rec := downloadObject(t, fake, "/browse/test-bucket/a.txt?dl=1")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Last-Modified") != "" {
		t.Errorf("expected no Last-Modified header, got %q", rec.Header().Get("Last-Modified"))
	}
	if rec.Body.String() != "hello" {
		t.Errorf("expected the object body, got %q", rec.Body.String())
	}
}

func TestGetObjectsClampsLimit(t *testing.T) {
	fake := &fakeS3{keys: []string{"a.txt"}}
	newFakeS3Server(t, fake)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket?limit=1000000", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if fake.lastMaxKeys != "1000" {
		t.Errorf("expected max-keys 1000, got %q", fake.lastMaxKeys)
	}

	req = httptest.NewRequest(http.MethodGet, "/browse/test-bucket?limit=-1", nil)
	rec = httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if fake.lastMaxKeys != "1" {
		t.Errorf("expected max-keys 1, got %q", fake.lastMaxKeys)
	}
}

func TestGetObjectsRejectsNonNumericLimit(t *testing.T) {
	fake := &fakeS3{keys: []string{"a.txt"}}
	newFakeS3Server(t, fake)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket?limit=abc", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetObjectsDefaultsLimit(t *testing.T) {
	fake := &fakeS3{keys: []string{"a.txt"}}
	newFakeS3Server(t, fake)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if fake.lastMaxKeys != "100" {
		t.Errorf("expected max-keys 100, got %q", fake.lastMaxKeys)
	}
}

func TestGetObjectsEscapesObjectURLs(t *testing.T) {
	fake := &fakeS3{keys: []string{"my file.txt", "a#b.txt", "café.txt"}}
	newFakeS3Server(t, fake)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var result schema.BrowseObjectResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}
	want := map[string]string{
		"my file.txt": "/browse/test-bucket/my%20file.txt",
		"a#b.txt":     "/browse/test-bucket/a%23b.txt",
		"café.txt":    "/browse/test-bucket/caf%C3%A9.txt",
	}
	if len(result.Objects) != len(want) {
		t.Fatalf("expected %d objects, got %d", len(want), len(result.Objects))
	}
	for _, object := range result.Objects {
		if object.Url != want[*object.ObjectKey] {
			t.Errorf("expected URL %q for %q, got %q", want[*object.ObjectKey], *object.ObjectKey, object.Url)
		}
	}
}

func TestGetObjectsSkipsNilListEntries(t *testing.T) {
	fake := &fakeS3{keys: []string{"a.txt"}, nilEntries: 1, nilPrefixes: 1}
	newFakeS3Server(t, fake)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var result schema.BrowseObjectResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}
	if len(result.Objects) != 1 {
		t.Errorf("expected 1 object, got %d", len(result.Objects))
	}
	if len(result.Prefixes) != 0 {
		t.Errorf("expected 0 prefixes, got %v", result.Prefixes)
	}
}

func TestGetObjectsSendsContinuationTokenOnlyWhenGiven(t *testing.T) {
	fake := &fakeS3{keys: []string{"a.txt"}}
	newFakeS3Server(t, fake)

	req := httptest.NewRequest(http.MethodGet, "/browse/test-bucket", nil)
	rec := httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if fake.tokenPresent {
		t.Error("expected no continuation token to be sent")
	}

	req = httptest.NewRequest(http.MethodGet, "/browse/test-bucket?next=2", nil)
	rec = httptest.NewRecorder()
	testBrowseMux().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !fake.tokenPresent || fake.lastToken != "2" {
		t.Errorf("expected continuation token 2, got present=%v value=%q", fake.tokenPresent, fake.lastToken)
	}
}
