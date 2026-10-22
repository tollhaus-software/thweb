package crypto

import (
	"context"
	"crypto/rand"
	"fmt"
	"io"

	kms "cloud.google.com/go/kms/apiv1"
	kmspb "cloud.google.com/go/kms/apiv1/kmspb"
	"golang.org/x/oauth2"
	"google.golang.org/api/option"
)

type GCPKMSProvider struct {
	defaultClient *kms.KeyManagementClient
	keyPath       string // e.g. "projects/thweb-prod-kms/locations/eur8/keyRings/thweb-prod-keyring/cryptoKeys/health-data-key"
}

func NewGCPKMSProvider(client *kms.KeyManagementClient, keyPath string) *GCPKMSProvider {
	return &GCPKMSProvider{
		defaultClient: client,
		keyPath:       keyPath,
	}
}

// NewGCPKMSProviderFromCredentialsFile initializes a GCPKMSProvider backed by an explicit service account JSON key file
// without relying on or polluting global GOOGLE_APPLICATION_CREDENTIALS.
func NewGCPKMSProviderFromCredentialsFile(ctx context.Context, credentialsFile string, keyPath string) (*GCPKMSProvider, error) {
	if credentialsFile == "" {
		return nil, fmt.Errorf("credentials file path is required for service-account-backed KMS provider (key: %s)", keyPath)
	}
	client, err := kms.NewKeyManagementClient(ctx, option.WithCredentialsFile(credentialsFile))
	if err != nil {
		return nil, fmt.Errorf("failed to create KMS client from credentials file %q: %w", credentialsFile, err)
	}
	return &GCPKMSProvider{
		defaultClient: client,
		keyPath:       keyPath,
	}, nil
}

func (g *GCPKMSProvider) KeyPath() string {
	return g.keyPath
}

func (g *GCPKMSProvider) Close() error {
	if g.defaultClient != nil {
		return g.defaultClient.Close()
	}
	return nil
}

// getKMSClient returns a user-scoped KMS client using the user's OAuth access token if available,
// falling back to the default service account client.
func (g *GCPKMSProvider) getKMSClient(ctx context.Context, accessToken string) (*kms.KeyManagementClient, func(), error) {
	if accessToken != "" && accessToken != "null" && accessToken != "undefined" {
		ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: accessToken})
		userClient, err := kms.NewKeyManagementClient(ctx, option.WithTokenSource(ts))
		if err != nil {
			return nil, nil, fmt.Errorf("failed to create user-scoped KMS client: %w", err)
		}
		cleanup := func() { userClient.Close() }
		return userClient, cleanup, nil
	}

	if g.defaultClient != nil {
		return g.defaultClient, func() {}, nil
	}

	return nil, nil, fmt.Errorf("no user OAuth access token provided for KMS operation and no default KMS client configured")
}

func (g *GCPKMSProvider) EncryptDEK(ctx context.Context, dek []byte, userEmail string, accessToken string) ([]byte, error) {
	client, cleanup, err := g.getKMSClient(ctx, accessToken)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	req := &kmspb.EncryptRequest{
		Name:      g.keyPath,
		Plaintext: dek,
	}
	resp, err := client.Encrypt(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("GCP KMS Encrypt failed for user %s: %w", userEmail, err)
	}
	return resp.Ciphertext, nil
}

func (g *GCPKMSProvider) DecryptDEK(ctx context.Context, encryptedDEK []byte, userEmail string, accessToken string) ([]byte, error) {
	client, cleanup, err := g.getKMSClient(ctx, accessToken)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	req := &kmspb.DecryptRequest{
		Name:       g.keyPath,
		Ciphertext: encryptedDEK,
	}
	resp, err := client.Decrypt(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("GCP KMS Decrypt failed for user %s: %w", userEmail, err)
	}
	return resp.Plaintext, nil
}

func (g *GCPKMSProvider) GenerateDEK(ctx context.Context, userEmail string, accessToken string) ([]byte, []byte, error) {
	dek := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, dek); err != nil {
		return nil, nil, fmt.Errorf("failed to generate random DEK: %w", err)
	}

	encryptedDEK, err := g.EncryptDEK(ctx, dek, userEmail, accessToken)
	if err != nil {
		return nil, nil, err
	}

	return dek, encryptedDEK, nil
}

func (g *GCPKMSProvider) ValidateAccess(ctx context.Context, userEmail string, accessToken string) error {
	client, cleanup, err := g.getKMSClient(ctx, accessToken)
	if err != nil {
		return err
	}
	defer cleanup()

	dummyDEK := make([]byte, 32)
	req := &kmspb.EncryptRequest{
		Name:      g.keyPath,
		Plaintext: dummyDEK,
	}
	_, err = client.Encrypt(ctx, req)
	if err != nil {
		return fmt.Errorf("GCP KMS access validation failed for user %s: %w", userEmail, err)
	}
	return nil
}
