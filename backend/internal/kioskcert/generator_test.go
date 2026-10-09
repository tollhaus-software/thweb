package kioskcert

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"software.sslmate.com/src/go-pkcs12"
)

func createTestCA(t *testing.T, dir string) (string, string) {
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate CA key: %v", err)
	}

	caTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			CommonName: "Test Kiosk CA",
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	caDER, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("failed to create CA cert: %v", err)
	}

	caCertPath := filepath.Join(dir, "kiosk-ca.crt")
	caCertFile, err := os.Create(caCertPath)
	if err != nil {
		t.Fatalf("failed to create CA cert file: %v", err)
	}
	defer caCertFile.Close()
	pem.Encode(caCertFile, &pem.Block{Type: "CERTIFICATE", Bytes: caDER})

	caKeyPath := filepath.Join(dir, "kiosk-ca.key")
	caKeyFile, err := os.Create(caKeyPath)
	if err != nil {
		t.Fatalf("failed to create CA key file: %v", err)
	}
	defer caKeyFile.Close()
	caKeyDER, err := x509.MarshalPKCS8PrivateKey(caKey)
	if err != nil {
		t.Fatalf("failed to marshal CA key: %v", err)
	}
	pem.Encode(caKeyFile, &pem.Block{Type: "PRIVATE KEY", Bytes: caKeyDER})

	return caCertPath, caKeyPath
}

func TestGenerator_IssueKioskCert(t *testing.T) {
	tmpDir := t.TempDir()
	caCertPath, caKeyPath := createTestCA(t, tmpDir)

	gen := &Generator{
		CaCertPath: caCertPath,
		CaKeyPath:  caKeyPath,
	}

	if !gen.HasCA() {
		t.Fatal("expected HasCA() to return true")
	}

	p12Data, err := gen.IssueKioskCert("tablet-room-1", "mypassword", 30)
	if err != nil {
		t.Fatalf("IssueKioskCert failed: %v", err)
	}
	if len(p12Data) == 0 {
		t.Fatal("expected non-empty p12Data")
	}

	// Decode and verify the PKCS#12 bundle
	privKey, cert, caCerts, err := pkcs12.DecodeChain(p12Data, "mypassword")
	if err != nil {
		t.Fatalf("pkcs12.DecodeChain failed: %v", err)
	}
	if len(caCerts) == 0 {
		t.Fatal("expected caCerts in chain")
	}
	if privKey == nil {
		t.Fatal("expected private key in p12")
	}
	if cert == nil {
		t.Fatal("expected certificate in p12")
	}
	if cert.Subject.CommonName != "tablet-room-1" {
		t.Errorf("cert CN = %q, want %q", cert.Subject.CommonName, "tablet-room-1")
	}
	if len(cert.ExtKeyUsage) != 1 || cert.ExtKeyUsage[0] != x509.ExtKeyUsageClientAuth {
		t.Errorf("expected ExtKeyUsageClientAuth, got %v", cert.ExtKeyUsage)
	}

	// Verify cert against CA
	caCertPEM, _ := os.ReadFile(caCertPath)
	caBlock, _ := pem.Decode(caCertPEM)
	caCert, _ := x509.ParseCertificate(caBlock.Bytes)
	roots := x509.NewCertPool()
	roots.AddCert(caCert)

	opts := x509.VerifyOptions{
		Roots:     roots,
		KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	if _, err := cert.Verify(opts); err != nil {
		t.Errorf("cert verification failed: %v", err)
	}
}

func TestGenerator_MissingCA(t *testing.T) {
	gen := NewGenerator("/nonexistent/dir")
	if gen.HasCA() {
		t.Fatal("expected HasCA() to return false for nonexistent dir")
	}

	_, err := gen.IssueKioskCert("tablet-room-1", "mypassword", 30)
	if err == nil {
		t.Fatal("expected error when CA files do not exist")
	}
}
