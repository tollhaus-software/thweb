package crypto

import (
	"context"
	"bytes"
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
