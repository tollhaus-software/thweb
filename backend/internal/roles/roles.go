package roles

import (
	_ "embed"
	"fmt"
	"log"
	"os"

	"gopkg.in/yaml.v3"
)

// Supported auto-grant triggers
const (
	AutoGrantMockAuth        = "mock_auth"
	AutoGrantKioskCert       = "kiosk_cert"
	AutoGrantIdentifierEmail = "identifier_email"
)

//go:embed default_roles.yaml
var defaultRolesYAML []byte

// RoleConfig represents a single role definition parsed from YAML.
type RoleConfig struct {
	ID              string   `yaml:"id" json:"id"`
	Name            string   `yaml:"name" json:"name"`
	Description     string   `yaml:"description" json:"description"`
	Permissions     []string `yaml:"permissions" json:"permissions"`
	DenyPermissions []string `yaml:"deny_permissions" json:"deny_permissions"`
	AutoGrantOn     []string `yaml:"auto_grant_on" json:"auto_grant_on"`
}

// Config represents the top-level structure of the roles.yaml configuration file.
type Config struct {
	Roles []RoleConfig `yaml:"roles"`
}

// LoadDefault parses and returns the embedded default roles configuration.
func LoadDefault() *Config {
	cfg, err := LoadFromBytes(defaultRolesYAML)
	if err != nil {
		log.Printf("[ROLES ERROR] Failed to parse embedded default roles: %v", err)
		return &Config{Roles: []RoleConfig{}}
	}
	return cfg
}

// LoadFromFile reads and parses a YAML roles configuration file from the given path.
func LoadFromFile(filePath string) (*Config, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read roles file %q: %w", filePath, err)
	}
	return LoadFromBytes(data)
}

// LoadFromBytes unmarshals YAML bytes into Config.
func LoadFromBytes(data []byte) (*Config, error) {
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal roles YAML: %w", err)
	}
	return &cfg, nil
}

// LoadConfig loads the roles configuration from the path specified by filePath.
// If filePath is empty, it returns the embedded default roles.
func LoadConfig(filePath string) (*Config, error) {
	if filePath == "" {
		log.Println("[ROLES] No ROLES_FILE specified. Using embedded default roles.")
		return LoadDefault(), nil
	}

	cfg, err := LoadFromFile(filePath)
	if err != nil {
		return nil, err
	}
	log.Printf("[ROLES] Loaded %d role definitions from %s", len(cfg.Roles), filePath)
	return cfg, nil
}

// RolesForTrigger returns all role IDs and deduplicated permissions configured
// to be auto-granted on the given trigger (e.g. mock_auth, kiosk_cert, identifier_email).
func (c *Config) RolesForTrigger(trigger string) (roleIDs []string, permissions []string) {
	if c == nil {
		return nil, nil
	}

	seenPerms := make(map[string]bool)
	for _, r := range c.Roles {
		hasTrigger := false
		for _, t := range r.AutoGrantOn {
			if t == trigger {
				hasTrigger = true
				break
			}
		}

		if hasTrigger {
			roleIDs = append(roleIDs, r.ID)
			for _, p := range r.Permissions {
				if !seenPerms[p] {
					seenPerms[p] = true
					permissions = append(permissions, p)
				}
			}
		}
	}

	return roleIDs, permissions
}

// GetRole returns a pointer to the RoleConfig with the given ID, or nil if not found.
func (c *Config) GetRole(id string) *RoleConfig {
	if c == nil {
		return nil
	}
	for i := range c.Roles {
		if c.Roles[i].ID == id {
			return &c.Roles[i]
		}
	}
	return nil
}

// DeniedPermissionsForRoles returns a slice of unique denied permissions
// configured across any of the given role IDs.
func (c *Config) DeniedPermissionsForRoles(roleIDs []string) []string {
	if c == nil || len(roleIDs) == 0 {
		return nil
	}

	denyMap := make(map[string]bool)
	for _, rID := range roleIDs {
		if r := c.GetRole(rID); r != nil {
			for _, dp := range r.DenyPermissions {
				denyMap[dp] = true
			}
		}
	}

	res := make([]string, 0, len(denyMap))
	for dp := range denyMap {
		res = append(res, dp)
	}
	return res
}
