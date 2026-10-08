package crypto

import (
	"bytes"
	"context"
	"testing"
)

func TestRequestCipherContext(t *testing.T) {
	mockKMS := NewMockKMSProvider()
	ctx := context.Background()
	userEmail := "test@example.com"
	accessToken := "mock_token"

	reqCtx := NewRequestCipherContext(mockKMS, userEmail, accessToken)
	defer reqCtx.Close()

	payload := []byte(`{"vaccination_checks":[{"vaccination_type":"Measles","checked_by":"admin@example.com","checked_on":"2026-08-10","proof_seen":"impfausweis"}]}`)

	encryptedBlob, err := reqCtx.Encrypt(ctx, payload)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if len(encryptedBlob) <= 15 {
		t.Fatalf("Encrypted blob too short: %d bytes", len(encryptedBlob))
	}

	decryptedPayload, err := reqCtx.Decrypt(ctx, encryptedBlob)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if !bytes.Equal(payload, decryptedPayload) {
		t.Fatalf("Expected decrypted payload %s, got %s", string(payload), string(decryptedPayload))
	}

	// Verify request-scoped DEK caching
	// Decrypting the same blob again should use cached DEK without error
	decrypted2, err := reqCtx.Decrypt(ctx, encryptedBlob)
	if err != nil {
		t.Fatalf("Second Decrypt failed: %v", err)
	}
	if !bytes.Equal(payload, decrypted2) {
		t.Fatalf("Second Decrypt payload mismatch")
	}
}

func TestMockKMSProvider_AccessDenial(t *testing.T) {
	mockKMS := NewMockKMSProvider()
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
	unauthorizedCtx := NewRequestCipherContext(mockKMS, userEmail, unauthorizedToken)
	defer unauthorizedCtx.Close()

	payload := []byte(`{"test":"data"}`)
	if _, err := unauthorizedCtx.Encrypt(ctx, payload); err == nil {
		t.Errorf("Expected Encrypt to fail with unauthorized token, got nil")
	}

	// 4. Decrypt with unauthorized token should fail
	validCtx := NewRequestCipherContext(mockKMS, userEmail, "valid-token")
	defer validCtx.Close()
	encryptedBlob, err := validCtx.Encrypt(ctx, payload)
	if err != nil {
		t.Fatalf("Setup Encrypt failed: %v", err)
	}

	if _, err := unauthorizedCtx.Decrypt(ctx, encryptedBlob); err == nil {
		t.Errorf("Expected Decrypt to fail with unauthorized token, got nil")
	}
}

