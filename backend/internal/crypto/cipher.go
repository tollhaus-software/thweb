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

	"github.com/google/uuid"
)

const (
	BlobVersionByte byte = 0x02
	BlobHeaderSize  int  = 1 + 16 + 12 // 1B version + 16B UUID key_id + 12B GCM nonce = 29 bytes

	PurposeVaccination = "vaccination"
	PurposeAllergies   = "allergies"
)

// DEKRecord represents a row in the centralized data_encryption_keys table.
type DEKRecord struct {
	ID           uuid.UUID
	Purpose      string
	KMSKeyPath   string
	EncryptedDEK []byte
	IsActive     bool
}

// DEKStore defines the persistence interface for centralized Data Encryption Keys (DEKs).
type DEKStore interface {
	// GetActiveDEK returns the active DEK record for the given purpose, or (nil, nil) if none exists.
	GetActiveDEK(ctx context.Context, purpose string) (*DEKRecord, error)
	// GetDEKByID returns the DEK record for the given UUID, or (nil, nil) if not found.
	GetDEKByID(ctx context.Context, id uuid.UUID) (*DEKRecord, error)
	// CreateActiveDEK persists a newly generated active DEK for the given purpose.
	// If another concurrent caller already inserted an active DEK for this purpose,
	// it returns the existing active DEK record.
	CreateActiveDEK(ctx context.Context, rec DEKRecord) (*DEKRecord, error)
}

// MemoryDEKStore is an in-memory DEKStore implementation used for unit testing.
type MemoryDEKStore struct {
	mu     sync.Mutex
	byID   map[uuid.UUID]DEKRecord
	active map[string]uuid.UUID
}

func NewMemoryDEKStore() *MemoryDEKStore {
	return &MemoryDEKStore{
		byID:   make(map[uuid.UUID]DEKRecord),
		active: make(map[string]uuid.UUID),
	}
}

func (m *MemoryDEKStore) GetActiveDEK(_ context.Context, purpose string) (*DEKRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	id, ok := m.active[purpose]
	if !ok {
		return nil, nil
	}
	rec, ok := m.byID[id]
	if !ok {
		return nil, nil
	}
	cp := rec
	cp.EncryptedDEK = append([]byte(nil), rec.EncryptedDEK...)
	return &cp, nil
}

func (m *MemoryDEKStore) GetDEKByID(_ context.Context, id uuid.UUID) (*DEKRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	rec, ok := m.byID[id]
	if !ok {
		return nil, nil
	}
	cp := rec
	cp.EncryptedDEK = append([]byte(nil), rec.EncryptedDEK...)
	return &cp, nil
}

func (m *MemoryDEKStore) CreateActiveDEK(_ context.Context, rec DEKRecord) (*DEKRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if existingID, ok := m.active[rec.Purpose]; ok {
		existing := m.byID[existingID]
		cp := existing
		cp.EncryptedDEK = append([]byte(nil), existing.EncryptedDEK...)
		return &cp, nil
	}

	if rec.ID == uuid.Nil {
		rec.ID = uuid.New()
	}
	rec.IsActive = true
	cp := rec
	cp.EncryptedDEK = append([]byte(nil), rec.EncryptedDEK...)
	m.byID[cp.ID] = cp
	m.active[cp.Purpose] = cp.ID

	out := cp
	out.EncryptedDEK = append([]byte(nil), cp.EncryptedDEK...)
	return &out, nil
}

// RotateActiveDEK retires the current active DEK for purpose and activates the provided DEKRecord.
func (m *MemoryDEKStore) RotateActiveDEK(rec DEKRecord) (*DEKRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if oldID, ok := m.active[rec.Purpose]; ok {
		if oldRec, exists := m.byID[oldID]; exists {
			oldRec.IsActive = false
			m.byID[oldID] = oldRec
		}
		delete(m.active, rec.Purpose)
	}

	if rec.ID == uuid.Nil {
		rec.ID = uuid.New()
	}
	rec.IsActive = true
	cp := rec
	cp.EncryptedDEK = append([]byte(nil), rec.EncryptedDEK...)
	m.byID[cp.ID] = cp
	m.active[cp.Purpose] = cp.ID
	return &cp, nil
}

// KMSProvider defines the interface for KMS interaction (Google Cloud KMS or Mock KMS)
type KMSProvider interface {
	// KeyPath returns the configured KMS key resource path
	KeyPath() string
	// EncryptDEK encrypts a DEK with KMS for the given user email and OAuth token
	EncryptDEK(ctx context.Context, dek []byte, userEmail string, accessToken string) (encryptedDEK []byte, err error)
	// DecryptDEK decrypts an encrypted DEK with KMS for the given user email and OAuth token
	DecryptDEK(ctx context.Context, encryptedDEK []byte, userEmail string, accessToken string) (dek []byte, err error)
	// GenerateDEK generates a new random 32-byte DEK and its KMS-encrypted counterpart
	GenerateDEK(ctx context.Context, userEmail string, accessToken string) (plaintextDEK []byte, encryptedDEK []byte, err error)
	// ValidateAccess checks whether the user with the given OAuth token has permission to use the KMS key
	ValidateAccess(ctx context.Context, userEmail string, accessToken string) error
}

// RequestCipherContext manages ephemeral request-scoped DEK caching & zeroing
type RequestCipherContext struct {
	mu          sync.Mutex
	dekCache    map[uuid.UUID][]byte // key_id (UUID) -> 32-byte plaintextDEK
	activeKeyID *uuid.UUID
	kmsProvider KMSProvider
	dekStore    DEKStore
	purpose     string
	userEmail   string
	accessToken string
}

func NewRequestCipherContext(kmsProvider KMSProvider, dekStore DEKStore, purpose string, userEmail string, accessToken string) *RequestCipherContext {
	if dekStore == nil {
		dekStore = NewMemoryDEKStore()
	}
	if purpose == "" {
		purpose = PurposeVaccination
	}
	return &RequestCipherContext{
		dekCache:    make(map[uuid.UUID][]byte),
		kmsProvider: kmsProvider,
		dekStore:    dekStore,
		purpose:     purpose,
		userEmail:   userEmail,
		accessToken: accessToken,
	}
}

// Close clears and zeroes out all DEK byte slices in memory at the end of the HTTP request
func (r *RequestCipherContext) Close() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for k, dek := range r.dekCache {
		for i := range dek {
			dek[i] = 0 // Zero out RAM buffer
		}
		delete(r.dekCache, k)
	}
	r.activeKeyID = nil
}

// GetOrDecryptDEKByID resolves and decrypts the DEK for a given key_id UUID once per request context.
func (r *RequestCipherContext) GetOrDecryptDEKByID(ctx context.Context, keyID uuid.UUID) ([]byte, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if dek, exists := r.dekCache[keyID]; exists {
		return dek, nil
	}

	rec, err := r.dekStore.GetDEKByID(ctx, keyID)
	if err != nil {
		return nil, fmt.Errorf("failed to query DEK store for key %s: %w", keyID, err)
	}
	if rec == nil {
		return nil, fmt.Errorf("DEK %s not found in data_encryption_keys", keyID)
	}

	dek, err := r.kmsProvider.DecryptDEK(ctx, rec.EncryptedDEK, r.userEmail, r.accessToken)
	if err != nil {
		return nil, fmt.Errorf("request cipher context failed to decrypt DEK %s for user %s: %w", keyID, r.userEmail, err)
	}

	dekCopy := make([]byte, len(dek))
	copy(dekCopy, dek)
	for i := range dek {
		dek[i] = 0
	}
	r.dekCache[keyID] = dekCopy

	return dekCopy, nil
}

// GetOrCreateActiveDEK resolves the active DEK for the context's purpose, lazily generating and storing one if none exists.
func (r *RequestCipherContext) GetOrCreateActiveDEK(ctx context.Context) (uuid.UUID, []byte, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.activeKeyID != nil {
		if dek, exists := r.dekCache[*r.activeKeyID]; exists {
			return *r.activeKeyID, dek, nil
		}
	}

	rec, err := r.dekStore.GetActiveDEK(ctx, r.purpose)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("failed to query active DEK for purpose %q: %w", r.purpose, err)
	}

	if rec != nil {
		if dek, exists := r.dekCache[rec.ID]; exists {
			idCopy := rec.ID
			r.activeKeyID = &idCopy
			return rec.ID, dek, nil
		}

		dek, err := r.kmsProvider.DecryptDEK(ctx, rec.EncryptedDEK, r.userEmail, r.accessToken)
		if err != nil {
			return uuid.Nil, nil, fmt.Errorf("failed to decrypt active DEK %s for user %s: %w", rec.ID, r.userEmail, err)
		}

		dekCopy := make([]byte, len(dek))
		copy(dekCopy, dek)
		for i := range dek {
			dek[i] = 0
		}
		r.dekCache[rec.ID] = dekCopy
		idCopy := rec.ID
		r.activeKeyID = &idCopy
		return rec.ID, dekCopy, nil
	}

	// Lazy initialization: no active DEK exists yet for this purpose
	plaintextDEK, encryptedDEK, err := r.kmsProvider.GenerateDEK(ctx, r.userEmail, r.accessToken)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("failed to generate active DEK for purpose %q: %w", r.purpose, err)
	}

	candidate := DEKRecord{
		ID:           uuid.New(),
		Purpose:      r.purpose,
		KMSKeyPath:   r.kmsProvider.KeyPath(),
		EncryptedDEK: encryptedDEK,
		IsActive:     true,
	}

	savedRec, err := r.dekStore.CreateActiveDEK(ctx, candidate)
	if err != nil {
		for i := range plaintextDEK {
			plaintextDEK[i] = 0
		}
		return uuid.Nil, nil, fmt.Errorf("failed to persist active DEK for purpose %q: %w", r.purpose, err)
	}

	if savedRec.ID == candidate.ID {
		dekCopy := make([]byte, len(plaintextDEK))
		copy(dekCopy, plaintextDEK)
		for i := range plaintextDEK {
			plaintextDEK[i] = 0
		}
		r.dekCache[savedRec.ID] = dekCopy
		idCopy := savedRec.ID
		r.activeKeyID = &idCopy
		return savedRec.ID, dekCopy, nil
	}

	// Another concurrent request won the race to insert the active DEK
	for i := range plaintextDEK {
		plaintextDEK[i] = 0
	}

	dek, err := r.kmsProvider.DecryptDEK(ctx, savedRec.EncryptedDEK, r.userEmail, r.accessToken)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("failed to decrypt concurrently created active DEK %s: %w", savedRec.ID, err)
	}

	dekCopy := make([]byte, len(dek))
	copy(dekCopy, dek)
	for i := range dek {
		dek[i] = 0
	}
	r.dekCache[savedRec.ID] = dekCopy
	idCopy := savedRec.ID
	r.activeKeyID = &idCopy
	return savedRec.ID, dekCopy, nil
}

// Encrypt encrypts a raw byte payload using the active DEK and packages the compact 29-byte header blob:
// [version:1B (0x02)][key_id:16B UUID][nonce:12B][ciphertext]
func (r *RequestCipherContext) Encrypt(ctx context.Context, plaintext []byte) ([]byte, error) {
	if len(plaintext) == 0 {
		return nil, nil
	}

	keyID, plaintextDEK, err := r.GetOrCreateActiveDEK(ctx)
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
func (r *RequestCipherContext) Decrypt(ctx context.Context, encryptedBlob []byte) ([]byte, error) {
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

	plaintextDEK, err := r.GetOrDecryptDEKByID(ctx, keyID)
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
