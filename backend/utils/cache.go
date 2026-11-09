package utils

import (
	"strings"
	"sync"
	"time"
)

type CacheEntry struct {
	value     interface{}
	expiresAt time.Time
}

type CacheManager struct {
	cache *sync.Map
}

var Cache *CacheManager

func InitCacheManager() {
	Cache = &CacheManager{
		cache: &sync.Map{},
	}
}

func (c *CacheManager) Set(key string, value interface{}, ttl time.Duration) {
	c.cache.Store(key, CacheEntry{
		value:     value,
		expiresAt: time.Now().Add(ttl),
	})
}

func (c *CacheManager) Get(key string) interface{} {
	entry, ok := c.cache.Load(key)
	if !ok {
		return nil
	}

	cacheEntry, ok := entry.(CacheEntry)
	if !ok {
		c.cache.Delete(key)
		return nil
	}
	if cacheEntry.expiresAt.Before(time.Now()) {
		c.cache.Delete(key)
		return nil
	}

	return cacheEntry.value
}

func (c *CacheManager) ClearPrefix(prefix string) {
	c.cache.Range(func(key, _ interface{}) bool {
		keyString, ok := key.(string)
		if ok && strings.HasPrefix(keyString, prefix) {
			c.cache.Delete(key)
		}
		return true
	})
}
