package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/database"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func TestAlumniAndContactConsents(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	database.ApplySchemaMigrations(ctx, dbURL)
	appStore := store.NewStore(pool)
	authn := auth.NewAuthenticator("mock", true, appStore)
	hub := NewHub()
	router := SetupRouter(appStore, authn, hub, nil)

	adminEmail := "alumni-admin@example.com"
	adminID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO users (id, email, canonical_email, permissions) VALUES ($1, $2, $2, '[\"*\"]'::jsonb) ON CONFLICT (id) DO NOTHING", adminID, adminEmail)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminID)
	}()

	// 1. Create a historical alumni family
	createFamilyPayload := map[string]interface{}{
		"family_type": "historical_alumni",
		"parents": []map[string]interface{}{
			{
				"first_name": "Ehemalige",
				"last_name":  "Mutter",
				"emails": []map[string]interface{}{
					{"value": "alumni.mother@example.com", "identifier_email": true, "address_list": true},
				},
			},
		},
	}
	bodyBytes, _ := json.Marshal(createFamilyPayload)
	req := httptest.NewRequest("POST", "/api/families", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-Email", adminEmail)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("expected 200/201 on create family, got %d (%s)", rec.Code, rec.Body.String())
	}

	var createdFam models.Family
	if err := json.Unmarshal(rec.Body.Bytes(), &createdFam); err != nil {
		t.Fatalf("failed to decode created family: %v", err)
	}
	if createdFam.FamilyType != "historical_alumni" {
		t.Fatalf("expected family_type historical_alumni, got %q", createdFam.FamilyType)
	}
	defer func() {
		_ = appStore.DeleteFamily(ctx, adminID, createdFam.ID, adminEmail)
	}()

	if len(createdFam.Parents) == 0 {
		t.Fatalf("expected created family to have parents")
	}
	parentID := createdFam.Parents[0].ID

	// 2. Ensure historical_alumni does NOT appear in /api/families/overview
	reqOverview := httptest.NewRequest("GET", "/api/families/overview", nil)
	reqOverview.Header.Set("X-Forwarded-Email", adminEmail)
	recOverview := httptest.NewRecorder()
	router.ServeHTTP(recOverview, reqOverview)
	if recOverview.Code != http.StatusOK {
		t.Fatalf("expected 200 on families/overview, got %d", recOverview.Code)
	}
	var overviewFams []OverviewFamily
	if err := json.Unmarshal(recOverview.Body.Bytes(), &overviewFams); err != nil {
		t.Fatalf("failed to decode overview families: %v", err)
	}
	for _, of := range overviewFams {
		if of.ID == createdFam.ID {
			t.Fatalf("historical_alumni family %s should NOT be in families/overview", createdFam.ID)
		}
	}

	// 3. Ensure GetParentInfoByIdentifierEmail returns nil for historical_alumni email
	pID, fID, err := appStore.GetParentInfoByIdentifierEmail(ctx, "alumni.mother@example.com")
	if err != nil {
		t.Fatalf("GetParentInfoByIdentifierEmail failed: %v", err)
	}
	if pID != nil || fID != nil {
		t.Fatalf("expected nil parent/family for historical_alumni identifier email, got pID=%v, fID=%v", pID, fID)
	}

	// 4. Create Contact Consent for the parent
	consentPayload := map[string]interface{}{
		"parent_id":    parentID,
		"consent_type": "alumni_contact",
		"status":       "granted",
		"channel":      "email",
		"notes":        "Zustimmung für Sommerfest-Einladungen erteilt",
	}
	cBodyBytes, _ := json.Marshal(consentPayload)
	reqConsent := httptest.NewRequest("POST", "/api/contact-consents", bytes.NewReader(cBodyBytes))
	reqConsent.Header.Set("Content-Type", "application/json")
	reqConsent.Header.Set("X-Forwarded-Email", adminEmail)
	recConsent := httptest.NewRecorder()
	router.ServeHTTP(recConsent, reqConsent)
	if recConsent.Code != http.StatusOK && recConsent.Code != http.StatusCreated {
		t.Fatalf("expected 200/201 creating contact consent, got %d (%s)", recConsent.Code, recConsent.Body.String())
	}
	var createdConsent models.ContactConsent
	if err := json.Unmarshal(recConsent.Body.Bytes(), &createdConsent); err != nil {
		t.Fatalf("failed to decode contact consent: %v", err)
	}
	if createdConsent.Status != "granted" || createdConsent.ConsentType != "alumni_contact" {
		t.Fatalf("unexpected consent: %+v", createdConsent)
	}

	// 5. Verify consent is loaded on parent via ListFamilies
	fams, err := appStore.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("failed to list families: %v", err)
	}
	var foundFam *models.Family
	for _, f := range fams {
		if f.ID == createdFam.ID {
			foundFam = &f
			break
		}
	}
	if foundFam == nil {
		t.Fatalf("created family not found in ListFamilies")
	}
	if len(foundFam.Parents[0].ContactConsents) == 0 {
		t.Fatalf("expected parent to have contact consents")
	}
	if foundFam.Parents[0].ContactConsents[0].Status != "granted" {
		t.Fatalf("expected consent status granted, got %s", foundFam.Parents[0].ContactConsents[0].Status)
	}

	// 6. Update Contact Consent (e.g. revoke)
	updatePayload := map[string]interface{}{
		"consent_type": "alumni_contact",
		"status":       "revoked",
		"channel":      "email",
		"notes":        "Widerrufen am Telefon",
	}
	upBytes, _ := json.Marshal(updatePayload)
	reqUp := httptest.NewRequest("PUT", fmt.Sprintf("/api/contact-consents/%s", createdConsent.ID), bytes.NewReader(upBytes))
	reqUp.Header.Set("Content-Type", "application/json")
	reqUp.Header.Set("X-Forwarded-Email", adminEmail)
	recUp := httptest.NewRecorder()
	router.ServeHTTP(recUp, reqUp)
	if recUp.Code != http.StatusOK {
		t.Fatalf("expected 200 updating contact consent, got %d (%s)", recUp.Code, recUp.Body.String())
	}
	var updatedConsent models.ContactConsent
	if err := json.Unmarshal(recUp.Body.Bytes(), &updatedConsent); err != nil {
		t.Fatalf("failed to decode updated consent: %v", err)
	}
	if updatedConsent.Status != "revoked" || updatedConsent.RevokedAt == nil {
		t.Fatalf("expected revoked status and revoked_at timestamp, got %+v", updatedConsent)
	}

	// 7. Update family_type via endpoint
	famTypePayload := map[string]interface{}{
		"family_type": "regular",
	}
	ftBytes, _ := json.Marshal(famTypePayload)
	reqFt := httptest.NewRequest("PUT", fmt.Sprintf("/api/families/%s/family-type", createdFam.ID), bytes.NewReader(ftBytes))
	reqFt.Header.Set("Content-Type", "application/json")
	reqFt.Header.Set("X-Forwarded-Email", adminEmail)
	recFt := httptest.NewRecorder()
	router.ServeHTTP(recFt, reqFt)
	if recFt.Code != http.StatusOK {
		t.Fatalf("expected 200 updating family type, got %d (%s)", recFt.Code, recFt.Body.String())
	}

	// 8. Delete Contact Consent
	reqDel := httptest.NewRequest("DELETE", fmt.Sprintf("/api/contact-consents/%s", createdConsent.ID), nil)
	reqDel.Header.Set("X-Forwarded-Email", adminEmail)
	recDel := httptest.NewRecorder()
	router.ServeHTTP(recDel, reqDel)
	if recDel.Code != http.StatusNoContent {
		t.Fatalf("expected 204 deleting contact consent, got %d (%s)", recDel.Code, recDel.Body.String())
	}
}
