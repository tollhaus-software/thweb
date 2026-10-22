package crypto

import (
	"bytes"
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
)

func TestRequestCipherContext(t *testing.T) {
	mockKMS := NewMockKMSProvider()
	dekStore := NewMemoryDEKStore()
	ctx := context.Background()
	userEmail := "test@example.com"
	accessToken := "mock_token"

	reqCtx := NewRequestCipherContext(mockKMS, dekStore, PurposeVaccination, userEmail, accessToken)
	defer reqCtx.Close()

	payload := []byte(`{"vaccination_checks":[{"vaccination_type":"Measles","checked_by":"admin@example.com","checked_on":"2026-08-10","proof_seen":"impfausweis"}]}`)

	encryptedBlob, err := reqCtx.Encrypt(ctx, payload)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	// Verify 29-byte compact header + 16-byte GCM tag + payload length
	expectedLen := BlobHeaderSize + 16 + len(payload)
	if len(encryptedBlob) != expectedLen {
		t.Fatalf("Expected encrypted blob length %d, got %d", expectedLen, len(encryptedBlob))
	}
	if encryptedBlob[0] != BlobVersionByte {
		t.Fatalf("Expected blob version 0x%02x, got 0x%02x", BlobVersionByte, encryptedBlob[0])
	}

	// Verify active DEK was lazily created in DEKStore and matches blob's 16-byte key_id
	activeDEK, err := dekStore.GetActiveDEK(ctx, PurposeVaccination)
	if err != nil || activeDEK == nil {
		t.Fatalf("Expected active DEK in store, got %v, err=%v", activeDEK, err)
	}
	var blobKeyID uuid.UUID
	copy(blobKeyID[:], encryptedBlob[1:17])
	if blobKeyID != activeDEK.ID {
		t.Fatalf("Expected blob key_id %s to match active DEK ID %s", blobKeyID, activeDEK.ID)
	}

	decryptedPayload, err := reqCtx.Decrypt(ctx, encryptedBlob)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if !bytes.Equal(payload, decryptedPayload) {
		t.Fatalf("Expected decrypted payload %s, got %s", string(payload), string(decryptedPayload))
	}

	// Verify request-scoped DEK caching: decrypting in a fresh read context across 100 records makes only 1 KMS Decrypt call
	var blobs [][]byte
	for i := 0; i < 100; i++ {
		wCtx := NewRequestCipherContext(mockKMS, dekStore, PurposeVaccination, userEmail, accessToken)
		b, err := wCtx.Encrypt(ctx, []byte(fmt.Sprintf(`{"child":%d}`, i)))
		wCtx.Close()
		if err != nil {
			t.Fatalf("Encrypt %d failed: %v", i, err)
		}
		blobs = append(blobs, b)
	}

	decryptBefore := mockKMS.DecryptCalls()
	readCtx := NewRequestCipherContext(mockKMS, dekStore, PurposeVaccination, userEmail, accessToken)
	for i, b := range blobs {
		plain, err := readCtx.Decrypt(ctx, b)
		if err != nil {
			t.Fatalf("Batch Decrypt %d failed: %v", i, err)
		}
		want := fmt.Sprintf(`{"child":%d}`, i)
		if string(plain) != want {
			t.Fatalf("Batch Decrypt %d got %s, want %s", i, string(plain), want)
		}
	}
	readCtx.Close()
	decryptCalls := mockKMS.DecryptCalls() - decryptBefore
	if decryptCalls != 1 {
		t.Fatalf("Expected exactly 1 KMS Decrypt call for 100 records, got %d", decryptCalls)
	}
}

func TestRequestCipherContext_KeyRotation(t *testing.T) {
	mockKMS := NewMockKMSProvider()
	dekStore := NewMemoryDEKStore()
	ctx := context.Background()
	userEmail := "test@example.com"
	accessToken := "mock_token"

	// Encrypt record 1 with initial lazily-created DEK
	ctx1 := NewRequestCipherContext(mockKMS, dekStore, PurposeVaccination, userEmail, accessToken)
	blob1, err := ctx1.Encrypt(ctx, []byte(`{"record":1}`))
	ctx1.Close()
	if err != nil {
		t.Fatalf("Encrypt 1 failed: %v", err)
	}

	// Rotate DEK in store
	_, newEncDEK, err := mockKMS.GenerateDEK(ctx, userEmail, accessToken)
	if err != nil {
		t.Fatalf("GenerateDEK failed: %v", err)
	}
	_, err = dekStore.RotateActiveDEK(DEKRecord{
		ID:           uuid.New(),
		Purpose:      PurposeVaccination,
		KMSKeyPath:   mockKMS.KeyPath(),
		EncryptedDEK: newEncDEK,
		IsActive:     true,
	})
	if err != nil {
		t.Fatalf("RotateActiveDEK failed: %v", err)
	}

	// Encrypt record 2 with rotated DEK
	ctx2 := NewRequestCipherContext(mockKMS, dekStore, PurposeVaccination, userEmail, accessToken)
	blob2, err := ctx2.Encrypt(ctx, []byte(`{"record":2}`))
	ctx2.Close()
	if err != nil {
		t.Fatalf("Encrypt 2 failed: %v", err)
	}

	// Verify both old and new blobs decrypt in the same read context
	readCtx := NewRequestCipherContext(mockKMS, dekStore, PurposeVaccination, userEmail, accessToken)
	defer readCtx.Close()

	p1, err := readCtx.Decrypt(ctx, blob1)
	if err != nil || string(p1) != `{"record":1}` {
		t.Fatalf("Decrypt blob1 failed: %s, err=%v", string(p1), err)
	}
	p2, err := readCtx.Decrypt(ctx, blob2)
	if err != nil || string(p2) != `{"record":2}` {
		t.Fatalf("Decrypt blob2 failed: %s, err=%v", string(p2), err)
	}
}

func TestMockKMSProvider_AccessDenial(t *testing.T) {
	mockKMS := NewMockKMSProvider()
	dekStore := NewMemoryDEKStore()
	ctx := context.Background()
	userEmail := "unauthorized@example.com"
	unauthorizedToken := "no-access"

	// 1. ValidateAccess should fail
	if err := mockKMS.ValidateAccess(ctx, userEmail, unauthorizedToken); err == nil {
		t.Errorf("Expected ValidateAccess to fail for unauthorized token, got nil")
	}

	// 2. ValidateAccess should succeed for valid token
	if err := mockKMS.ValidateAccess(ctx, userEmail, "valid-token"); err != nil {
		t.Errorf("Expected ValidateAccess to succeed for valid token, got %v", err)
	}

	// 3. Encrypt with unauthorized token should fail
	unauthorizedCtx := NewRequestCipherContext(mockKMS, dekStore, PurposeVaccination, userEmail, unauthorizedToken)
	defer unauthorizedCtx.Close()

	payload := []byte(`{"test":"data"}`)
	if _, err := unauthorizedCtx.Encrypt(ctx, payload); err == nil {
		t.Errorf("Expected Encrypt to fail with unauthorized token, got nil")
	}

	// 4. Decrypt with unauthorized token should fail
	validCtx := NewRequestCipherContext(mockKMS, dekStore, PurposeVaccination, userEmail, "valid-token")
	defer validCtx.Close()
	encryptedBlob, err := validCtx.Encrypt(ctx, payload)
	if err != nil {
		t.Fatalf("Setup Encrypt failed: %v", err)
	}

	if _, err := unauthorizedCtx.Decrypt(ctx, encryptedBlob); err == nil {
		t.Errorf("Expected Decrypt to fail with unauthorized token, got nil")
	}
}
