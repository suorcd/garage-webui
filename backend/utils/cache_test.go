package utils

import "testing"

func TestCacheGetTreatsWrongTypeAsMiss(t *testing.T) {
	InitCacheManager()
	Cache.cache.Store("key", "not a cache entry")

	if got := Cache.Get("key"); got != nil {
		t.Fatalf("expected a cache miss, got %v", got)
	}
}
