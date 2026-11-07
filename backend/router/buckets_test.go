package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
)

type fakeGetAllGarage struct {
	mu        sync.Mutex
	ids       []string
	delays    map[string]time.Duration
	errors    map[string]bool
	malformed map[string]bool
	inFlight  int
	maxFlight int
}

func (f *fakeGetAllGarage) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/v2/ListBuckets":
		result := make([]schema.GetBucketsRes, 0, len(f.ids))
		for _, id := range f.ids {
			result = append(result, schema.GetBucketsRes{ID: id, GlobalAliases: []string{"global-" + id}})
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

	case "/v2/GetBucketInfo":
		id := r.URL.Query().Get("id")
		f.mu.Lock()
		f.inFlight++
		if f.inFlight > f.maxFlight {
			f.maxFlight = f.inFlight
		}
		f.mu.Unlock()
		defer func() {
			f.mu.Lock()
			f.inFlight--
			f.mu.Unlock()
		}()

		if delay := f.delays[id]; delay > 0 {
			time.Sleep(delay)
		}
		if f.errors[id] {
			writeAliasError(w, http.StatusInternalServerError, "boom")
			return
		}
		if f.malformed[id] {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{not json`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(schema.Bucket{ID: id, GlobalAliases: []string{"global-" + id}, Objects: 3})

	default:
		writeAliasError(w, http.StatusNotFound, "not found")
	}
}

func (f *fakeGetAllGarage) maxInFlight() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.maxFlight
}

func newGetAllTestHandler(t *testing.T, garage http.Handler) http.Handler {
	t.Helper()

	server := httptest.NewServer(garage)
	t.Cleanup(server.Close)

	t.Setenv("API_BASE_URL", server.URL)
	t.Setenv("API_ADMIN_KEY", "test-admin-key")
	t.Setenv("AUTH_DISABLED", "true")
	t.Setenv("AUTH_USER_PASS", "")

	utils.InitCacheManager()
	sessionMgr := utils.InitSessionManager()
	return sessionMgr.LoadAndSave(HandleApiRouter())
}

func getAllBuckets(t *testing.T, handler http.Handler) []schema.Bucket {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/buckets", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var buckets []schema.Bucket
	if err := json.Unmarshal(rec.Body.Bytes(), &buckets); err != nil {
		t.Fatalf("cannot decode response: %v", err)
	}
	return buckets
}

func TestGetAllBoundsConcurrency(t *testing.T) {
	ids := make([]string, 20)
	delays := make(map[string]time.Duration, len(ids))
	for i := range ids {
		ids[i] = fmt.Sprintf("bucket-%02d", i)
		delays[ids[i]] = 100 * time.Millisecond
	}
	fake := &fakeGetAllGarage{ids: ids, delays: delays}
	handler := newGetAllTestHandler(t, fake)

	getAllBuckets(t, handler)

	if max := fake.maxInFlight(); max > 8 {
		t.Errorf("expected at most 8 concurrent bucket fetches, got %d", max)
	}
}

func TestGetAllSurfacesPerBucketErrors(t *testing.T) {
	fake := &fakeGetAllGarage{
		ids:    []string{"bucket-a", "bucket-b"},
		errors: map[string]bool{"bucket-b": true},
	}
	handler := newGetAllTestHandler(t, fake)

	buckets := getAllBuckets(t, handler)

	if len(buckets) != 2 {
		t.Fatalf("expected 2 buckets, got %d", len(buckets))
	}
	for _, bucket := range buckets {
		if bucket.ID == "bucket-b" && bucket.Error == "" {
			t.Error("expected the failed bucket to carry an error")
		}
		if bucket.ID == "bucket-a" && bucket.Error != "" {
			t.Errorf("expected the good bucket to carry no error, got %q", bucket.Error)
		}
	}
}

func TestGetAllSurfacesMalformedBucketBodies(t *testing.T) {
	fake := &fakeGetAllGarage{
		ids:       []string{"bucket-a", "bucket-b"},
		malformed: map[string]bool{"bucket-b": true},
	}
	handler := newGetAllTestHandler(t, fake)

	buckets := getAllBuckets(t, handler)

	if len(buckets) != 2 {
		t.Fatalf("expected 2 buckets, got %d", len(buckets))
	}
	for _, bucket := range buckets {
		if bucket.ID == "bucket-b" && bucket.Error == "" {
			t.Error("expected the malformed bucket to carry an error")
		}
		if bucket.ID == "bucket-a" && bucket.Error != "" {
			t.Errorf("expected the good bucket to carry no error, got %q", bucket.Error)
		}
	}
}

func TestGetAllSortsByID(t *testing.T) {
	fake := &fakeGetAllGarage{
		ids:    []string{"bucket-c", "bucket-a", "bucket-b"},
		delays: map[string]time.Duration{"bucket-a": 100 * time.Millisecond},
	}
	handler := newGetAllTestHandler(t, fake)

	buckets := getAllBuckets(t, handler)

	want := []string{"bucket-a", "bucket-b", "bucket-c"}
	if len(buckets) != len(want) {
		t.Fatalf("expected %d buckets, got %d", len(want), len(buckets))
	}
	for i := range want {
		if buckets[i].ID != want[i] {
			t.Errorf("expected order %v, got %v", want, []string{buckets[0].ID, buckets[1].ID, buckets[2].ID})
			break
		}
	}
}
