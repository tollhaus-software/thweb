package database

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/roles"
)

// SyncRoles synchronizes role definitions from the deployment YAML configuration
// into the PostgreSQL 'roles' table using an idempotent upsert.
func SyncRoles(ctx context.Context, pool *pgxpool.Pool, cfg *roles.Config) error {
	if cfg == nil || len(cfg.Roles) == 0 {
		log.Println("[ROLES] No roles to synchronize.")
		return nil
	}

	log.Printf("[ROLES] Synchronizing %d role(s) into database...", len(cfg.Roles))
	for _, r := range cfg.Roles {
		perms := r.Permissions
		if perms == nil {
			perms = []string{}
		}
		denyPerms := r.DenyPermissions
		if denyPerms == nil {
			denyPerms = []string{}
		}

		permsJSON, err := json.Marshal(perms)
		if err != nil {
			return fmt.Errorf("failed to serialize permissions for role %q: %w", r.ID, err)
		}
		denyPermsJSON, err := json.Marshal(denyPerms)
		if err != nil {
			return fmt.Errorf("failed to serialize deny_permissions for role %q: %w", r.ID, err)
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO roles (id, name, description, permissions, deny_permissions, updated_at)
			VALUES ($1, $2, $3, $4, $5, NOW())
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				permissions = EXCLUDED.permissions,
				deny_permissions = EXCLUDED.deny_permissions,
				updated_at = NOW()
		`, r.ID, r.Name, r.Description, permsJSON, denyPermsJSON)
		if err != nil {
			return fmt.Errorf("failed to upsert role %q: %w", r.ID, err)
		}
	}

	log.Println("[ROLES] All role definitions synchronized successfully.")
	return nil
}

// SeedMockUsers seeds mock development users (developer@example.com and caregiver@example.com)
// based on roles configured with auto_grant_on containing 'mock_auth'.
func SeedMockUsers(ctx context.Context, pool *pgxpool.Pool, cfg *roles.Config) error {
	log.Println("[ROLES] Seeding mock users for local testing...")

	// Find roles marked for auto-grant on mock_auth
	mockRoles, _ := cfg.RolesForTrigger(roles.AutoGrantMockAuth)
	if len(mockRoles) == 0 {
		mockRoles = []string{"admin"}
	}

	// 1. developer@example.com
	_, err := pool.Exec(ctx, `INSERT INTO users (email) VALUES ('developer@example.com') ON CONFLICT (email) DO NOTHING`)
	if err != nil {
		return fmt.Errorf("failed to seed developer user: %w", err)
	}

	for _, roleID := range mockRoles {
		_, err = pool.Exec(ctx, `
			INSERT INTO user_roles (user_id, role_id)
			SELECT id, $1 FROM users WHERE email = 'developer@example.com'
			ON CONFLICT (user_id, role_id) DO NOTHING
		`, roleID)
		if err != nil {
			return fmt.Errorf("failed to assign mock role %q to developer: %w", roleID, err)
		}
	}

	// 2. caregiver@example.com (if caregiver role exists)
	if cfg.GetRole("caregiver") != nil {
		_, err = pool.Exec(ctx, `INSERT INTO users (email) VALUES ('caregiver@example.com') ON CONFLICT (email) DO NOTHING`)
		if err != nil {
			return fmt.Errorf("failed to seed caregiver user: %w", err)
		}
		_, err = pool.Exec(ctx, `
			INSERT INTO user_roles (user_id, role_id)
			SELECT id, 'caregiver' FROM users WHERE email = 'caregiver@example.com'
			ON CONFLICT (user_id, role_id) DO NOTHING
		`)
		if err != nil {
			return fmt.Errorf("failed to assign caregiver role: %w", err)
		}
	}

	return nil
}
