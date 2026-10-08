package crypto

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"sync"
)

const BlobVersionByte byte = 0x01

// KMSProvider defines the interface for KMS interaction (Google Cloud KMS or Mock KMS)
type KMSProvider interface {
	// EncryptDEK encrypts a DEK (or requests a new DEK) with KMS for the given user email and OAuth token
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
	dekCache    map[string][]byte // string(encryptedDEK) -> plaintextDEK
	kmsProvider KMSProvider
	userEmail   string
	accessToken string
}

func NewRequestCipherContext(kmsProvider KMSProvider, userEmail string, accessToken string) *RequestCipherContext {
	return &RequestCipherContext{
		dekCache:    make(map[string][]byte),
		kmsProvider: kmsProvider,
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
}

// GetOrDecryptDEK fetches the decrypted DEK for encryptedDEK once per request context
func (r *RequestCipherContext) GetOrDecryptDEK(ctx context.Context, encryptedDEK []byte) ([]byte, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	cacheKey := string(encryptedDEK)
	if dek, exists := r.dekCache[cacheKey]; exists {
		return dek, nil
	}

	dek, err := r.kmsProvider.DecryptDEK(ctx, encryptedDEK, r.userEmail, r.accessToken)
	if err != nil {
		return nil, fmt.Errorf("request cipher context failed to decrypt DEK for user %s: %w", r.userEmail, err)
	}

	dekCopy := make([]byte, len(dek))
	copy(dekCopy, dek)
	r.dekCache[cacheKey] = dekCopy

	return dekCopy, nil
}

// Encrypt encrypts a raw byte payload using a new DEK and packages the encrypted blob
func (r *RequestCipherContext) Encrypt(ctx context.Context, plaintext []byte) ([]byte, error) {
	if len(plaintext) == 0 {
		return nil, nil
	}

	plaintextDEK, encryptedDEK, err := r.kmsProvider.GenerateDEK(ctx, r.userEmail, r.accessToken)
	if err != nil {
		return nil, fmt.Errorf("failed to generate DEK: %w", err)
	}

	defer func() {
		for i := range plaintextDEK {
			plaintextDEK[i] = 0
		}
	}()

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

	// Pack binary blob: [version:1B][dek_len:2B][encryptedDEK][nonce:12B][ciphertext]
	dekLen := uint16(len(encryptedDEK))
	blobLen := 1 + 2 + len(encryptedDEK) + len(nonce) + len(ciphertext)
	blob := make([]byte, blobLen)

	blob[0] = BlobVersionByte
	binary.BigEndian.PutUint16(blob[1:3], dekLen)
	copy(blob[3:3+dekLen], encryptedDEK)
	copy(blob[3+dekLen:3+int(dekLen)+len(nonce)], nonce)
	copy(blob[3+int(dekLen)+len(nonce):], ciphertext)

	return blob, nil
}

// Decrypt unpacks the blob, resolves the DEK (cached or decrypted from KMS), and decrypts plaintext
func (r *RequestCipherContext) Decrypt(ctx context.Context, encryptedBlob []byte) ([]byte, error) {
	if len(encryptedBlob) == 0 {
		return nil, nil
	}

	if len(encryptedBlob) < 3 {
		return nil, errors.New("invalid encrypted blob: payload too short")
	}

	version := encryptedBlob[0]
	if version != BlobVersionByte {
		return nil, fmt.Errorf("unsupported encrypted blob version: %d", version)
	}

	dekLen := int(binary.BigEndian.Uint16(encryptedBlob[1:3]))
	minHeaderLen := 1 + 2 + dekLen + 12 // 1B ver + 2B len + dekLen + 12B nonce
	if len(encryptedBlob) <= minHeaderLen {
		return nil, errors.New("invalid encrypted blob: payload header corrupt or missing ciphertext")
	}

	encryptedDEK := encryptedBlob[3 : 3+dekLen]
	nonce := encryptedBlob[3+dekLen : 3+dekLen+12]
	ciphertext := encryptedBlob[3+dekLen+12:]

	plaintextDEK, err := r.GetOrDecryptDEK(ctx, encryptedDEK)
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
