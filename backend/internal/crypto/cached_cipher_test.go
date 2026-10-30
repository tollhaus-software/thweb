package crypto

import (
	"bytes"
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestCachedCipherContext_BasicRoundtrip(t *testing.T) {
	mockKMS := NewMockKMSProvider()
	dekStore := NewMemoryDEKStore()
	ctx := context.Background()

	cipherCtx := NewCachedCipherContext(mockKMS, dekStore, PurposeAllergies, 5*time.Hour)
	defer cipherCtx.Close()

	payload := []byte(`{"allergies":[{"item":"Peanuts","severity":"high"}]}`)
	encryptedBlob, err := cipherCtx.Encrypt(ctx, payload)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if len(encryptedBlob) <= BlobHeaderSize {
		t.Fatalf("Encrypted blob too short: %d", len(encryptedBlob))
	}
	if encryptedBlob[0] != BlobVersionByte {
		t.Fatalf("Expected blob version 0x%02x, got 0x%02x", BlobVersionByte, encryptedBlob[0])
	}

	decrypted, err := cipherCtx.Decrypt(ctx, encryptedBlob)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}
	if !bytes.Equal(payload, decrypted) {
		t.Fatalf("Expected decrypted %s, got %s", payload, decrypted)
	}
}

func TestCachedCipherContext_TTLExpiry(t *testing.T) {
	mockKMS := NewMockKMSProvider()
	dekStore := NewMemoryDEKStore()
	ctx := context.Background()

	baseTime := time.Date(2026, 10, 30, 10, 0, 0, 0, time.UTC)
	currentTime := baseTime

	cipherCtx := NewCachedCipherContext(mockKMS, dekStore, PurposeAllergies, 5*time.Hour)
	cipherCtx.SetNowFunc(func() time.Time {
		return currentTime
	})
	defer cipherCtx.Close()

	// 1. Initial write lazily generates active DEK
	payload := []byte(`{"allergy":"milk"}`)
	blob, err := cipherCtx.Encrypt(ctx, payload)
	if err != nil {
		t.Fatalf("Initial encrypt failed: %v", err)
	}

	decryptCountBefore := mockKMS.DecryptCalls()

	// 2. Read at T + 1 hour -> should hit cache, 0 KMS Decrypt calls
	currentTime = baseTime.Add(1 * time.Hour)
	for i := 0; i < 10; i++ {
		plain, err := cipherCtx.Decrypt(ctx, blob)
		if err != nil {
			t.Fatalf("Decrypt at +1h failed: %v", err)
		}
		if !bytes.Equal(plain, payload) {
			t.Fatalf("Unexpected plain text: %s", plain)
		}
	}
	if mockKMS.DecryptCalls() != decryptCountBefore {
		t.Fatalf("Expected 0 KMS Decrypt calls during TTL, got %d", mockKMS.DecryptCalls()-decryptCountBefore)
	}

	// 3. Read at T + 4h 59m -> still within 5 hours TTL -> 0 KMS Decrypt calls
	currentTime = baseTime.Add(4*time.Hour + 59*time.Minute)
	_, err = cipherCtx.Decrypt(ctx, blob)
	if err != nil {
		t.Fatalf("Decrypt at +4h59m failed: %v", err)
	}
	if mockKMS.DecryptCalls() != decryptCountBefore {
		t.Fatalf("Expected 0 KMS Decrypt calls before TTL expiry, got %d", mockKMS.DecryptCalls()-decryptCountBefore)
	}

	// 4. Advance time past 5 hours TTL (T + 5h 1m) -> cache expired -> triggers KMS Decrypt call to refresh key
	currentTime = baseTime.Add(5*time.Hour + 1*time.Minute)
	_, err = cipherCtx.Decrypt(ctx, blob)
	if err != nil {
		t.Fatalf("Decrypt after TTL expiry failed: %v", err)
	}
	if mockKMS.DecryptCalls() != decryptCountBefore+1 {
		t.Fatalf("Expected exactly 1 KMS Decrypt call after TTL expiry, got %d", mockKMS.DecryptCalls()-decryptCountBefore)
	}

	// 5. Subsequent reads within the new 5h TTL window reuse cached key without new KMS calls
	for i := 0; i < 5; i++ {
		_, err = cipherCtx.Decrypt(ctx, blob)
		if err != nil {
			t.Fatalf("Subsequent decrypt failed: %v", err)
		}
	}
	if mockKMS.DecryptCalls() != decryptCountBefore+1 {
		t.Fatalf("Expected no additional KMS Decrypt calls in new TTL window, got %d", mockKMS.DecryptCalls()-decryptCountBefore)
	}
}

func TestCachedCipherContext_CheckActiveKeyIDOnWrites(t *testing.T) {
	mockKMS := NewMockKMSProvider()
	dekStore := NewMemoryDEKStore()
	ctx := context.Background()

	cipherCtx := NewCachedCipherContext(mockKMS, dekStore, PurposeAllergies, 5*time.Hour)
	defer cipherCtx.Close()

	// 1. Initial write
	blob1, err := cipherCtx.Encrypt(ctx, []byte(`{"allergen":"gluten"}`))
	if err != nil {
		t.Fatalf("Encrypt 1 failed: %v", err)
	}
	var keyID1 uuid.UUID
	copy(keyID1[:], blob1[1:17])

	// 2. Subsequent write without rotation should reuse the cached active key (checking active key_id in store)
	blob1b, err := cipherCtx.Encrypt(ctx, []byte(`{"allergen":"soy"}`))
	if err != nil {
		t.Fatalf("Encrypt 1b failed: %v", err)
	}
	var keyID1b uuid.UUID
	copy(keyID1b[:], blob1b[1:17])
	if keyID1 != keyID1b {
		t.Fatalf("Expected same active key_id %s, got %s", keyID1, keyID1b)
	}

	// 3. Rotate active DEK in store
	_, newEncDEK, err := mockKMS.GenerateDEK(ctx, "", "")
	if err != nil {
		t.Fatalf("GenerateDEK failed: %v", err)
	}
	rotatedRec, err := dekStore.RotateActiveDEK(DEKRecord{
		ID:           uuid.New(),
		Purpose:      PurposeAllergies,
		KMSKeyPath:   mockKMS.KeyPath(),
		EncryptedDEK: newEncDEK,
		IsActive:     true,
	})
	if err != nil {
		t.Fatalf("RotateActiveDEK failed: %v", err)
	}

	// 4. Next write MUST detect the new active key_id from store and encrypt with rotated DEK
	blob2, err := cipherCtx.Encrypt(ctx, []byte(`{"allergen":"mustard"}`))
	if err != nil {
		t.Fatalf("Encrypt 2 failed: %v", err)
	}
	var keyID2 uuid.UUID
	copy(keyID2[:], blob2[1:17])

	if keyID2 == keyID1 {
		t.Fatalf("Expected Encrypt after rotation to use new active key, but got old keyID %s", keyID2)
	}
	if keyID2 != rotatedRec.ID {
		t.Fatalf("Expected Encrypt after rotation to use %s, got %s", rotatedRec.ID, keyID2)
	}

	// 5. Verify both old and new blobs decrypt properly
	p1, err := cipherCtx.Decrypt(ctx, blob1)
	if err != nil || string(p1) != `{"allergen":"gluten"}` {
		t.Fatalf("Decrypt blob1 failed: %s, err=%v", p1, err)
	}
	p2, err := cipherCtx.Decrypt(ctx, blob2)
	if err != nil || string(p2) != `{"allergen":"mustard"}` {
		t.Fatalf("Decrypt blob2 failed: %s, err=%v", p2, err)
	}
}

func TestCachedCipherContext_InteroperabilityWithRequestCipherContext(t *testing.T) {
	mockKMS := NewMockKMSProvider()
	dekStore := NewMemoryDEKStore()
	ctx := context.Background()

	cachedCtx := NewCachedCipherContext(mockKMS, dekStore, PurposeAllergies, 5*time.Hour)
	defer cachedCtx.Close()

	reqCtx := NewRequestCipherContext(mockKMS, dekStore, PurposeAllergies, "", "")
	defer reqCtx.Close()

	payload := []byte(`{"allergies":[{"item":"Shellfish"}]}`)

	// Encrypted by CachedCipherContext -> Decrypted by RequestCipherContext
	blobFromCached, err := cachedCtx.Encrypt(ctx, payload)
	if err != nil {
		t.Fatalf("cachedCtx.Encrypt failed: %v", err)
	}
	decryptedByReq, err := reqCtx.Decrypt(ctx, blobFromCached)
	if err != nil || !bytes.Equal(payload, decryptedByReq) {
		t.Fatalf("reqCtx.Decrypt failed: %s, err=%v", decryptedByReq, err)
	}

	// Encrypted by RequestCipherContext -> Decrypted by CachedCipherContext
	blobFromReq, err := reqCtx.Encrypt(ctx, payload)
	if err != nil {
		t.Fatalf("reqCtx.Encrypt failed: %v", err)
	}
	decryptedByCached, err := cachedCtx.Decrypt(ctx, blobFromReq)
	if err != nil || !bytes.Equal(payload, decryptedByCached) {
		t.Fatalf("cachedCtx.Decrypt failed: %s, err=%v", decryptedByCached, err)
	}
}

func TestCachedCipherContext_Concurrency(t *testing.T) {
	mockKMS := NewMockKMSProvider()
	dekStore := NewMemoryDEKStore()
	ctx := context.Background()

	cipherCtx := NewCachedCipherContext(mockKMS, dekStore, PurposeAllergies, 5*time.Hour)
	defer cipherCtx.Close()

	var wg sync.WaitGroup
	const workers = 20
	const iterations = 50

	// Concurrent writes and reads
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for i := 0; i < iterations; i++ {
				data := []byte(fmt.Sprintf(`{"worker":%d,"iter":%d}`, workerID, i))
				blob, err := cipherCtx.Encrypt(ctx, data)
				if err != nil {
					t.Errorf("Worker %d Encrypt %d failed: %v", workerID, i, err)
					return
				}
				plain, err := cipherCtx.Decrypt(ctx, blob)
				if err != nil || !bytes.Equal(data, plain) {
					t.Errorf("Worker %d Decrypt %d failed: %s, err=%v", workerID, i, plain, err)
					return
				}
			}
		}(w)
	}

	wg.Wait()
}
