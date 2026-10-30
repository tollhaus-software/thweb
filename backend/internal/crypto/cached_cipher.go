package crypto

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/google/uuid"
)

// DefaultAllergiesKeyTTL defines the default in-memory caching duration (5 hours)
// for unwrapped KMS Data Encryption Keys.
const DefaultAllergiesKeyTTL = 5 * time.Hour

type cachedDEKEntry struct {
	dek       []byte
	expiresAt time.Time
}

// CachedCipherContext maintains an in-memory cache of unwrapped DEKs across HTTP requests.
// On writes, it verifies the active key_id against the DEK store to ensure key rotations
// take effect immediately, while unwrap calls to KMS remain bounded by the TTL.
type CachedCipherContext struct {
	mu          sync.RWMutex
	dekCache    map[uuid.UUID]cachedDEKEntry
	kmsProvider KMSProvider
	dekStore    DEKStore
	purpose     string
	ttl         time.Duration
	userEmail   string
	accessToken string
	nowFunc     func() time.Time
}

func NewCachedCipherContext(kmsProvider KMSProvider, dekStore DEKStore, purpose string, ttl time.Duration) *CachedCipherContext {
	if dekStore == nil {
		dekStore = NewMemoryDEKStore()
	}
	if purpose == "" {
		purpose = PurposeAllergies
	}
	if ttl <= 0 {
		ttl = DefaultAllergiesKeyTTL
	}
	return &CachedCipherContext{
		dekCache:    make(map[uuid.UUID]cachedDEKEntry),
		kmsProvider: kmsProvider,
		dekStore:    dekStore,
		purpose:     purpose,
		ttl:         ttl,
		nowFunc:     time.Now,
	}
}

// SetNowFunc allows overriding the time source for unit testing TTL expiry.
func (c *CachedCipherContext) SetNowFunc(fn func() time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.nowFunc = fn
}

func (c *CachedCipherContext) now() time.Time {
	if c.nowFunc != nil {
		return c.nowFunc()
	}
	return time.Now()
}

// Close zeroes out and flushes all cached DEK byte slices in memory.
func (c *CachedCipherContext) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	for k, entry := range c.dekCache {
		for i := range entry.dek {
			entry.dek[i] = 0
		}
		delete(c.dekCache, k)
	}
}

// CachedKeyCount returns the number of active cached keys currently in memory.
func (c *CachedCipherContext) CachedKeyCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.dekCache)
}

// GetOrDecryptDEKByID resolves and decrypts a DEK for a given key_id UUID.
// If already in memory and not expired according to the TTL, it returns the cached key.
// Otherwise, it queries the DEKStore, unwraps via KMS, and caches the result for the TTL.
func (c *CachedCipherContext) GetOrDecryptDEKByID(ctx context.Context, keyID uuid.UUID) ([]byte, error) {
	now := c.now()

	// 1. Fast path: check cache under read lock
	c.mu.RLock()
	entry, exists := c.dekCache[keyID]
	if exists && now.Before(entry.expiresAt) {
		dekCopy := make([]byte, len(entry.dek))
		copy(dekCopy, entry.dek)
		c.mu.RUnlock()
		return dekCopy, nil
	}
	c.mu.RUnlock()

	// 2. Slow path: acquire write lock
	c.mu.Lock()
	defer c.mu.Unlock()

	// Double-check under write lock
	now = c.now()
	entry, exists = c.dekCache[keyID]
	if exists && now.Before(entry.expiresAt) {
		dekCopy := make([]byte, len(entry.dek))
		copy(dekCopy, entry.dek)
		return dekCopy, nil
	}

	if c.kmsProvider == nil {
		return nil, errors.New("KMS provider is not configured")
	}

	rec, err := c.dekStore.GetDEKByID(ctx, keyID)
	if err != nil {
		return nil, fmt.Errorf("failed to query DEK store for key %s: %w", keyID, err)
	}
	if rec == nil {
		return nil, fmt.Errorf("DEK %s not found in data_encryption_keys", keyID)
	}

	dek, err := c.kmsProvider.DecryptDEK(ctx, rec.EncryptedDEK, c.userEmail, c.accessToken)
	if err != nil {
		return nil, fmt.Errorf("cached cipher context failed to decrypt DEK %s: %w", keyID, err)
	}

	storedDEK := make([]byte, len(dek))
	copy(storedDEK, dek)
	for i := range dek {
		dek[i] = 0
	}

	c.dekCache[keyID] = cachedDEKEntry{
		dek:       storedDEK,
		expiresAt: now.Add(c.ttl),
	}

	dekReturn := make([]byte, len(storedDEK))
	copy(dekReturn, storedDEK)
	return dekReturn, nil
}

// GetOrCreateActiveDEK resolves the active DEK for writes.
// To guarantee immediate reflection of key rotations, it checks the active key_id
// from the DEK store on every write. If that key is already in memory and not expired,
// it uses the cached unwrapped DEK without calling KMS.
func (c *CachedCipherContext) GetOrCreateActiveDEK(ctx context.Context) (uuid.UUID, []byte, error) {
	// Always check current active DEK in the store on write
	rec, err := c.dekStore.GetActiveDEK(ctx, c.purpose)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("failed to query active DEK for purpose %q: %w", c.purpose, err)
	}

	now := c.now()

	if rec != nil {
		// Fast path: active key is already cached and valid
		c.mu.RLock()
		entry, exists := c.dekCache[rec.ID]
		if exists && now.Before(entry.expiresAt) {
			dekCopy := make([]byte, len(entry.dek))
			copy(dekCopy, entry.dek)
			c.mu.RUnlock()
			return rec.ID, dekCopy, nil
		}
		c.mu.RUnlock()

		// Key not in cache or expired; acquire write lock and decrypt via KMS
		c.mu.Lock()
		defer c.mu.Unlock()

		now = c.now()
		entry, exists = c.dekCache[rec.ID]
		if exists && now.Before(entry.expiresAt) {
			dekCopy := make([]byte, len(entry.dek))
			copy(dekCopy, entry.dek)
			return rec.ID, dekCopy, nil
		}

		if c.kmsProvider == nil {
			return uuid.Nil, nil, errors.New("KMS provider is not configured")
		}

		dek, err := c.kmsProvider.DecryptDEK(ctx, rec.EncryptedDEK, c.userEmail, c.accessToken)
		if err != nil {
			return uuid.Nil, nil, fmt.Errorf("failed to decrypt active DEK %s: %w", rec.ID, err)
		}

		storedDEK := make([]byte, len(dek))
		copy(storedDEK, dek)
		for i := range dek {
			dek[i] = 0
		}

		c.dekCache[rec.ID] = cachedDEKEntry{
			dek:       storedDEK,
			expiresAt: now.Add(c.ttl),
		}

		dekReturn := make([]byte, len(storedDEK))
		copy(dekReturn, storedDEK)
		return rec.ID, dekReturn, nil
	}

	// Lazy initialization: no active DEK exists yet for this purpose in store
	c.mu.Lock()
	defer c.mu.Unlock()

	// Double-check if created concurrently
	rec, err = c.dekStore.GetActiveDEK(ctx, c.purpose)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("failed to re-query active DEK for purpose %q: %w", c.purpose, err)
	}
	now = c.now()
	if rec != nil {
		entry, exists := c.dekCache[rec.ID]
		if exists && now.Before(entry.expiresAt) {
			dekCopy := make([]byte, len(entry.dek))
			copy(dekCopy, entry.dek)
			return rec.ID, dekCopy, nil
		}

		if c.kmsProvider == nil {
			return uuid.Nil, nil, errors.New("KMS provider is not configured")
		}

		dek, err := c.kmsProvider.DecryptDEK(ctx, rec.EncryptedDEK, c.userEmail, c.accessToken)
		if err != nil {
			return uuid.Nil, nil, fmt.Errorf("failed to decrypt active DEK %s: %w", rec.ID, err)
		}

		storedDEK := make([]byte, len(dek))
		copy(storedDEK, dek)
		for i := range dek {
			dek[i] = 0
		}

		c.dekCache[rec.ID] = cachedDEKEntry{
			dek:       storedDEK,
			expiresAt: now.Add(c.ttl),
		}

		dekReturn := make([]byte, len(storedDEK))
		copy(dekReturn, storedDEK)
		return rec.ID, dekReturn, nil
	}

	if c.kmsProvider == nil {
		return uuid.Nil, nil, errors.New("KMS provider is not configured")
	}

	plaintextDEK, encryptedDEK, err := c.kmsProvider.GenerateDEK(ctx, c.userEmail, c.accessToken)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("failed to generate active DEK for purpose %q: %w", c.purpose, err)
	}

	candidate := DEKRecord{
		ID:           uuid.New(),
		Purpose:      c.purpose,
		KMSKeyPath:   c.kmsProvider.KeyPath(),
		EncryptedDEK: encryptedDEK,
		IsActive:     true,
	}

	savedRec, err := c.dekStore.CreateActiveDEK(ctx, candidate)
	if err != nil {
		for i := range plaintextDEK {
			plaintextDEK[i] = 0
		}
		return uuid.Nil, nil, fmt.Errorf("failed to persist active DEK for purpose %q: %w", c.purpose, err)
	}

	if savedRec.ID == candidate.ID {
		storedDEK := make([]byte, len(plaintextDEK))
		copy(storedDEK, plaintextDEK)
		for i := range plaintextDEK {
			plaintextDEK[i] = 0
		}
		c.dekCache[savedRec.ID] = cachedDEKEntry{
			dek:       storedDEK,
			expiresAt: now.Add(c.ttl),
		}
		dekReturn := make([]byte, len(storedDEK))
		copy(dekReturn, storedDEK)
		return savedRec.ID, dekReturn, nil
	}

	// Another concurrent request won the race to insert active DEK
	for i := range plaintextDEK {
		plaintextDEK[i] = 0
	}

	dek, err := c.kmsProvider.DecryptDEK(ctx, savedRec.EncryptedDEK, c.userEmail, c.accessToken)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("failed to decrypt concurrently created active DEK %s: %w", savedRec.ID, err)
	}

	storedDEK := make([]byte, len(dek))
	copy(storedDEK, dek)
	for i := range dek {
		dek[i] = 0
	}
	c.dekCache[savedRec.ID] = cachedDEKEntry{
		dek:       storedDEK,
		expiresAt: now.Add(c.ttl),
	}
	dekReturn := make([]byte, len(storedDEK))
	copy(dekReturn, storedDEK)
	return savedRec.ID, dekReturn, nil
}

// Encrypt encrypts a raw byte payload using the active DEK and packages the compact 29-byte header blob:
// [version:1B (0x02)][key_id:16B UUID][nonce:12B][ciphertext]
func (c *CachedCipherContext) Encrypt(ctx context.Context, plaintext []byte) ([]byte, error) {
	if len(plaintext) == 0 {
		return nil, nil
	}

	keyID, plaintextDEK, err := c.GetOrCreateActiveDEK(ctx)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(plaintextDEK)
	if err != nil {
		return nil, fmt.Errorf("failed to create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM mode: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)

	blob := make([]byte, BlobHeaderSize+len(ciphertext))
	blob[0] = BlobVersionByte
	copy(blob[1:17], keyID[:])
	copy(blob[17:29], nonce)
	copy(blob[29:], ciphertext)

	return blob, nil
}

// Decrypt unpacks the 29-byte header blob, resolves the DEK by key_id (cached or decrypted from KMS), and decrypts plaintext.
func (c *CachedCipherContext) Decrypt(ctx context.Context, encryptedBlob []byte) ([]byte, error) {
	if len(encryptedBlob) == 0 {
		return nil, nil
	}

	if len(encryptedBlob) <= BlobHeaderSize {
		return nil, errors.New("invalid encrypted blob: payload too short")
	}

	version := encryptedBlob[0]
	if version != BlobVersionByte {
		return nil, fmt.Errorf("unsupported encrypted blob version: 0x%02x", version)
	}

	var keyID uuid.UUID
	copy(keyID[:], encryptedBlob[1:17])
	nonce := encryptedBlob[17:29]
	ciphertext := encryptedBlob[29:]

	plaintextDEK, err := c.GetOrDecryptDEKByID(ctx, keyID)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve DEK for decryption: %w", err)
	}

	block, err := aes.NewCipher(plaintextDEK)
	if err != nil {
		return nil, fmt.Errorf("failed to create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt ciphertext payload: %w", err)
	}

	return plaintext, nil
}
