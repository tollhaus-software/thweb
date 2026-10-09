package kioskcert

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"time"

	"software.sslmate.com/src/go-pkcs12"
)

// Generator issues client certificates signed by the Kiosk Root CA and bundles them as PKCS#12 (.p12).
type Generator struct {
	CaCertPath string
	CaKeyPath  string
}

// NewGenerator creates a Generator with CA paths derived from caDir or environment variables.
func NewGenerator(caDir string) *Generator {
	if caDir == "" {
		if envDir := os.Getenv("KIOSK_CA_DIR"); envDir != "" {
			caDir = envDir
		} else {
			caDir = "/etc/kioskcerts"
		}
	}
	return &Generator{
		CaCertPath: filepath.Join(caDir, "kiosk-ca.crt"),
		CaKeyPath:  filepath.Join(caDir, "kiosk-ca.key"),
	}
}

// HasCA checks if both CA certificate and private key files exist.
func (g *Generator) HasCA() bool {
	if _, err := os.Stat(g.CaCertPath); err != nil {
		return false
	}
	if _, err := os.Stat(g.CaKeyPath); err != nil {
		return false
	}
	return true
}

// IssueKioskCert generates a client private key, creates an X.509 client certificate signed by the Kiosk CA,
// and returns a PKCS#12 (.p12) bundle protected with the specified password.
func (g *Generator) IssueKioskCert(deviceName string, password string, days int) ([]byte, error) {
	deviceName = strings.TrimSpace(deviceName)
	if deviceName == "" {
		return nil, errors.New("device_name cannot be empty")
	}
	if days <= 0 {
		days = 730 // default 2 years
	}

	caCertBytes, err := os.ReadFile(g.CaCertPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA certificate from %s: %w", g.CaCertPath, err)
	}
	caBlock, _ := pem.Decode(caCertBytes)
	if caBlock == nil {
		return nil, errors.New("failed to decode CA certificate PEM")
	}
	caCert, err := x509.ParseCertificate(caBlock.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse CA certificate: %w", err)
	}

	caKeyBytes, err := os.ReadFile(g.CaKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA private key from %s: %w", g.CaKeyPath, err)
	}
	keyBlock, _ := pem.Decode(caKeyBytes)
	if keyBlock == nil {
		return nil, errors.New("failed to decode CA private key PEM")
	}
	caKey, err := parsePrivateKey(keyBlock.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse CA private key: %w", err)
	}

	// 1. Generate client private key (RSA 2048)
	clientKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("failed to generate client RSA key: %w", err)
	}

	// 2. Prepare client certificate template
	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		return nil, fmt.Errorf("failed to generate serial number: %w", err)
	}

	now := time.Now()
	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName: deviceName,
		},
		NotBefore:             now.Add(-1 * time.Hour), // 1 hour leeway for clock skew
		NotAfter:              now.AddDate(0, 0, days),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		IsCA:                  false,
	}

	// 3. Sign client certificate with CA
	certDER, err := x509.CreateCertificate(rand.Reader, template, caCert, &clientKey.PublicKey, caKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign client certificate: %w", err)
	}

	clientCert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, fmt.Errorf("failed to parse generated client certificate: %w", err)
	}

	// 4. Encode into PKCS#12 bundle (.p12)
	pfxData, err := pkcs12.Legacy.Encode(clientKey, clientCert, []*x509.Certificate{caCert}, password)
	if err != nil {
		return nil, fmt.Errorf("failed to encode PKCS#12 bundle: %w", err)
	}

	return pfxData, nil
}

func parsePrivateKey(der []byte) (interface{}, error) {
	if key, err := x509.ParsePKCS8PrivateKey(der); err == nil {
		return key, nil
	}
	if key, err := x509.ParsePKCS1PrivateKey(der); err == nil {
		return key, nil
	}
	if key, err := x509.ParseECPrivateKey(der); err == nil {
		return key, nil
	}
	return nil, errors.New("unsupported private key format")
}
