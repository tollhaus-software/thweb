package roles

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefault(t *testing.T) {
	cfg := LoadDefault()
	if cfg == nil {
		t.Fatal("expected non-nil default config")
	}
	if len(cfg.Roles) == 0 {
		t.Fatal("expected roles to be loaded from embedded YAML, got 0")
	}

	admin := cfg.GetRole("admin")
	if admin == nil {
		t.Fatal("expected 'admin' role in default roles")
	}
	if len(admin.Permissions) != 1 || admin.Permissions[0] != "*" {
		t.Errorf("unexpected admin permissions: %v", admin.Permissions)
	}

	mockRoles, mockPerms := cfg.RolesForTrigger(AutoGrantMockAuth)
	if len(mockRoles) == 0 || mockRoles[0] != "admin" {
		t.Errorf("expected mock_auth trigger to return admin role, got %v", mockRoles)
	}
	if len(mockPerms) == 0 || mockPerms[0] != "*" {
		t.Errorf("expected mock_auth trigger to return wildcard permission, got %v", mockPerms)
	}

	kioskRoles, kioskPerms := cfg.RolesForTrigger(AutoGrantKioskCert)
	if len(kioskRoles) == 0 || kioskRoles[0] != "kiosk" {
		t.Errorf("expected kiosk_cert trigger to return kiosk role, got %v", kioskRoles)
	}
	if len(kioskPerms) == 0 || kioskPerms[0] != "dashboard.read" {
		t.Errorf("expected kiosk_cert trigger to return dashboard.read permission, got %v", kioskPerms)
	}

	identRoles, identPerms := cfg.RolesForTrigger(AutoGrantIdentifierEmail)
	if len(identRoles) == 0 || identRoles[0] != "restricted" {
		t.Errorf("expected identifier_email trigger to return restricted role, got %v", identRoles)
	}
	if len(identPerms) != 4 {
		t.Errorf("expected 4 permissions for identifier_email trigger, got %d (%v)", len(identPerms), identPerms)
	}
}

func TestLoadFromFile(t *testing.T) {
	tempDir := t.TempDir()
	yamlContent := `
roles:
  - id: custom_role
    name: Custom Role
    description: Custom description
    auto_grant_on:
      - custom_trigger
    permissions:
      - custom.read
      - custom.write
`
	filePath := filepath.Join(tempDir, "roles.yaml")
	if err := os.WriteFile(filePath, []byte(yamlContent), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	cfg, err := LoadFromFile(filePath)
	if err != nil {
		t.Fatalf("LoadFromFile failed: %v", err)
	}

	if len(cfg.Roles) != 1 {
		t.Fatalf("expected 1 role, got %d", len(cfg.Roles))
	}

	r := cfg.GetRole("custom_role")
	if r == nil {
		t.Fatal("expected custom_role to be found")
	}
	if r.Name != "Custom Role" {
		t.Errorf("expected Name='Custom Role', got %s", r.Name)
	}

	roles, perms := cfg.RolesForTrigger("custom_trigger")
	if len(roles) != 1 || roles[0] != "custom_role" {
		t.Errorf("expected roles=[custom_role], got %v", roles)
	}
	if len(perms) != 2 || perms[0] != "custom.read" || perms[1] != "custom.write" {
		t.Errorf("unexpected perms: %v", perms)
	}
}

func TestDeniedPermissionsForRoles(t *testing.T) {
	yamlContent := `
roles:
  - id: caregiver
    name: Caregiver
    permissions:
      - families.all.read
    deny_permissions:
      - fees.self.read
  - id: other_role
    name: Other
    deny_permissions:
      - fees.self.read
      - admin.special
`
	cfg, err := LoadFromBytes([]byte(yamlContent))
	if err != nil {
		t.Fatalf("failed to parse yaml: %v", err)
	}

	denied := cfg.DeniedPermissionsForRoles([]string{"caregiver"})
	if len(denied) != 1 || denied[0] != "fees.self.read" {
		t.Errorf("expected [fees.self.read], got %v", denied)
	}

	deniedCombined := cfg.DeniedPermissionsForRoles([]string{"caregiver", "other_role"})
	if len(deniedCombined) != 2 {
		t.Errorf("expected 2 unique denied perms, got %d (%v)", len(deniedCombined), deniedCombined)
	}

	none := cfg.DeniedPermissionsForRoles([]string{"nonexistent"})
	if len(none) != 0 {
		t.Errorf("expected 0 denied perms for nonexistent role, got %v", none)
	}
}
