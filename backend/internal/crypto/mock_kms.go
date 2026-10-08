package crypto

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
)

// MockKMSProvider simulates GCP KMS locally for development, mock mode, and offline testing
type MockKMSProvider struct {
	masterKey []byte
}

func NewMockKMSProvider() *MockKMSProvider {
	master := []byte("12345678901234567890123456789012")
	return &MockKMSProvider{masterKey: master}
}

func (m *MockKMSProvider) EncryptDEK(ctx context.Context, dek []byte, userEmail string, accessToken string) ([]byte, error) {
	if accessToken == "no-access" || accessToken == "unauthorized" || accessToken == "mock-kms-no-access" {
		return nil, fmt.Errorf("mock KMS: user %s has no access to KMS key", userEmail)
	}
	block, err := aes.NewCipher(m.masterKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, dek, nil), nil
}

func (m *MockKMSProvider) DecryptDEK(ctx context.Context, encryptedDEK []byte, userEmail string, accessToken string) ([]byte, error) {
	if accessToken == "no-access" || accessToken == "unauthorized" || accessToken == "mock-kms-no-access" {
		return nil, fmt.Errorf("mock KMS: user %s has no access to KMS key", userEmail)
	}
	block, err := aes.NewCipher(m.masterKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(encryptedDEK) < nonceSize {
		return nil, fmt.Errorf("mock encrypted DEK too short")
	}
	nonce, ciphertext := encryptedDEK[:nonceSize], encryptedDEK[nonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}

func (m *MockKMSProvider) GenerateDEK(ctx context.Context, userEmail string, accessToken string) ([]byte, []byte, error) {
	if accessToken == "no-access" || accessToken == "unauthorized" || accessToken == "mock-kms-no-access" {
		return nil, nil, fmt.Errorf("mock KMS: user %s has no access to KMS key", userEmail)
	}
	dek := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, dek); err != nil {
		return nil, nil, fmt.Errorf("failed to generate random DEK: %w", err)
	}

	encryptedDEK, err := m.EncryptDEK(ctx, dek, userEmail, accessToken)
	if err != nil {
		return nil, nil, err
	}

	return dek, encryptedDEK, nil
}

func (m *MockKMSProvider) ValidateAccess(ctx context.Context, userEmail string, accessToken string) error {
	if accessToken == "no-access" || accessToken == "unauthorized" || accessToken == "mock-kms-no-access" {
		return fmt.Errorf("mock KMS: user %s has no access to KMS key", userEmail)
	}
	return nil
}

