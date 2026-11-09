package api

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/models"
	"github.com/pavolmarko/thweb-backend/internal/store"
)

func setupHygieneTestServer(t *testing.T) (*Server, *pgxpool.Pool) {
	ctx := context.Background()
	dbURL := "postgres://postgres:postgres@localhost:5432/thweb?sslmode=disable"
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping test: unable to connect to db: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping test: unable to ping db: %v", err)
	}

	appStore := store.NewStore(pool)
	hub := NewHub()
	go hub.Run()
	s := &Server{
		Store: appStore,
		Hub:   hub,
	}
	return s, pool
}

func TestHygieneInstruction_UploadAndDownload(t *testing.T) {
	s, pool := setupHygieneTestServer(t)
	defer pool.Close()
	ctx := context.Background()

	// 1. Upload valid PDF
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "test_hygiene.pdf")
	if err != nil {
		t.Fatalf("CreateFormFile failed: %v", err)
	}
	pdfContent := []byte("%PDF-1.4 test hygiene content")
	if _, err := part.Write(pdfContent); err != nil {
		t.Fatalf("Write part failed: %v", err)
	}
	_ = writer.WriteField("title", "Hygiene-Belehrung 2026")
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/hygiene/instruction-document", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	adminUser := &models.UserWithPermissions{
		ID:                   uuid.New(),
		Email:                "hygieneadmin@example.com",
		EffectivePermissions: []string{"hygiene.infektionsschutz.management"},
	}
	req = req.WithContext(context.WithValue(ctx, auth.UserContextKey, adminUser))
	rec := httptest.NewRecorder()

	s.HandleUploadHygieneDocument(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("HandleUploadHygieneDocument failed: status %d, body: %s", rec.Code, rec.Body.String())
	}

	var uploadedInfo models.HygieneInstructionDocumentInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &uploadedInfo); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if uploadedInfo.Title != "Hygiene-Belehrung 2026" {
		t.Errorf("expected title 'Hygiene-Belehrung 2026', got %q", uploadedInfo.Title)
	}

	// 2. Fetch active document info
	reqInfo := httptest.NewRequest(http.MethodGet, "/api/hygiene/instruction-document/info", nil)
	reqInfo = reqInfo.WithContext(context.WithValue(ctx, auth.UserContextKey, adminUser))
	recInfo := httptest.NewRecorder()
	s.HandleGetActiveHygieneDocumentInfo(recInfo, reqInfo)
	if recInfo.Code != http.StatusOK {
		t.Fatalf("HandleGetActiveHygieneDocumentInfo failed: status %d", recInfo.Code)
	}

	// 3. Download active PDF
	reqDL := httptest.NewRequest(http.MethodGet, "/api/hygiene/instruction-document", nil)
	reqDL = reqDL.WithContext(context.WithValue(ctx, auth.UserContextKey, adminUser))
	recDL := httptest.NewRecorder()
	s.HandleGetActiveHygieneDocument(recDL, reqDL)
	if recDL.Code != http.StatusOK {
		t.Fatalf("HandleGetActiveHygieneDocument failed: status %d", recDL.Code)
	}
	if recDL.Header().Get("Content-Type") != "application/pdf" {
		t.Errorf("expected Content-Type application/pdf, got %s", recDL.Header().Get("Content-Type"))
	}
	if !bytes.Equal(recDL.Body.Bytes(), pdfContent) {
		t.Errorf("downloaded content mismatch")
	}

	// 4. Download PDF by ID
	rCtx := chi.NewRouteContext()
	rCtx.URLParams.Add("id", uploadedInfo.ID.String())
	reqByID := httptest.NewRequest(http.MethodGet, "/api/hygiene/instruction-document/"+uploadedInfo.ID.String(), nil)
	reqByID = reqByID.WithContext(context.WithValue(ctx, auth.UserContextKey, adminUser))
	reqByID = reqByID.WithContext(context.WithValue(reqByID.Context(), chi.RouteCtxKey, rCtx))
	recByID := httptest.NewRecorder()
	s.HandleGetHygieneDocumentByID(recByID, reqByID)
	if recByID.Code != http.StatusOK {
		t.Fatalf("HandleGetHygieneDocumentByID failed: status %d", recByID.Code)
	}
	if !bytes.Equal(recByID.Body.Bytes(), pdfContent) {
		t.Errorf("download by ID content mismatch")
	}
}

func TestHygieneInstruction_StatusAndSelfCertify(t *testing.T) {
	s, pool := setupHygieneTestServer(t)
	defer pool.Close()
	ctx := context.Background()

	// 1. Setup a test family and parent
	parentID := uuid.New()
	famID := uuid.New()
	emailsJSON := `[{"value":"parent.hygiene@example.com","identifier_email":true}]`
	_, err := pool.Exec(ctx, "INSERT INTO families (id) VALUES ($1)", famID)
	if err != nil {
		t.Fatalf("insert family failed: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM families WHERE id = $1", famID)
	}()

	_, err = pool.Exec(ctx, "INSERT INTO parents (id, family_id, first_name, last_name, emails) VALUES ($1, $2, 'Eva', 'Muster', $3)", parentID, famID, emailsJSON)
	if err != nil {
		t.Fatalf("insert parent failed: %v", err)
	}

	// 2. Upload an active PDF
	doc := models.HygieneInstructionDocument{
		Filename:      "hygiene_guidelines.pdf",
		MimeType:      "application/pdf",
		FileSize:      25,
		FileData:      []byte("%PDF-1.4 guidelines content"),
		Title:         "Infektionsschutzbelehrung",
		EffectiveFrom: time.Now().UTC(),
	}
	savedDoc, err := s.Store.SaveHygieneInstructionDocument(ctx, doc, "admin@example.com")
	if err != nil {
		t.Fatalf("SaveHygieneInstructionDocument failed: %v", err)
	}

	parentUser := &models.UserWithPermissions{
		ID:                   uuid.Nil,
		Email:                "parent.hygiene@example.com",
		FamilyID:             &famID,
		ParentID:             &parentID,
		EffectivePermissions: []string{"hygiene.infektionsschutz.self"},
	}

	// A child of the family started 12 months ago: family start date + 12m is reached
	childID := uuid.New()
	if _, err := pool.Exec(ctx, `INSERT INTO children (id, family_id, first_name, last_name, birth_date)
		VALUES ($1, $2, 'Kind', 'Muster', '2021-01-01')`, childID, famID); err != nil {
		t.Fatalf("insert child failed: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO children_group_changes (child, change_date, target_group)
		VALUES ($1, $2, 1)`, childID, time.Now().UTC().AddDate(-1, 0, 0)); err != nil {
		t.Fatalf("insert group change failed: %v", err)
	}

	// 3. Check status: with no prior events but a family start 12 months ago, needs_instruction should be true
	reqStatus := httptest.NewRequest(http.MethodGet, "/api/hygiene/my-status", nil)
	reqStatus = reqStatus.WithContext(context.WithValue(ctx, auth.UserContextKey, parentUser))
	recStatus := httptest.NewRecorder()
	s.HandleGetMyHygieneStatus(recStatus, reqStatus)
	if recStatus.Code != http.StatusOK {
		t.Fatalf("HandleGetMyHygieneStatus failed: status %d", recStatus.Code)
	}

	var statusResp models.HygieneUserStatusResponse
	if err := json.Unmarshal(recStatus.Body.Bytes(), &statusResp); err != nil {
		t.Fatalf("failed to decode status response: %v", err)
	}
	if !statusResp.NeedsInstruction {
		t.Errorf("expected NeedsInstruction = true for user with no events")
	}

	// 4. Perform self-certification
	reqCert := httptest.NewRequest(http.MethodPost, "/api/hygiene/certify", bytes.NewBufferString(`{}`))
	reqCert = reqCert.WithContext(context.WithValue(ctx, auth.UserContextKey, parentUser))
	recCert := httptest.NewRecorder()
	s.HandleCertifyHygieneInstruction(recCert, reqCert)
	if recCert.Code != http.StatusOK {
		t.Fatalf("HandleCertifyHygieneInstruction failed: status %d, body: %s", recCert.Code, recCert.Body.String())
	}

	var certResult struct {
		Success bool                         `json:"success"`
		Event   models.HygieneBelehrungEvent `json:"event"`
	}
	if err := json.Unmarshal(recCert.Body.Bytes(), &certResult); err != nil {
		t.Fatalf("failed to decode certify response: %v", err)
	}
	if !certResult.Success {
		t.Errorf("expected success true")
	}
	if certResult.Event.EventType != "recertify" {
		t.Errorf("expected event_type recertify, got %s", certResult.Event.EventType)
	}
	if certResult.Event.DocumentID == nil || *certResult.Event.DocumentID != savedDoc.ID {
		t.Errorf("expected document_id %s, got %v", savedDoc.ID, certResult.Event.DocumentID)
	}

	// 5. Check status again: should now be false (freshly certified)
	recStatus2 := httptest.NewRecorder()
	s.HandleGetMyHygieneStatus(recStatus2, reqStatus)
	if recStatus2.Code != http.StatusOK {
		t.Fatalf("HandleGetMyHygieneStatus failed: status %d", recStatus2.Code)
	}
	var statusResp2 models.HygieneUserStatusResponse
	if err := json.Unmarshal(recStatus2.Body.Bytes(), &statusResp2); err != nil {
		t.Fatalf("failed to decode status response: %v", err)
	}
	if statusResp2.NeedsInstruction {
		t.Errorf("expected NeedsInstruction = false after fresh certification")
	}
	if statusResp2.LastInstructionType == nil || *statusResp2.LastInstructionType != "recertify" {
		t.Errorf("expected LastInstructionType = recertify")
	}
	if statusResp2.NextDueDate == nil {
		t.Errorf("expected NextDueDate to be set")
	} else {
		expectedDueDate := time.Now().UTC().AddDate(0, 12, 0).Format("2006-01-02")
		if *statusResp2.NextDueDate != expectedDueDate {
			t.Errorf("expected NextDueDate = %s (12 months), got %s", expectedDueDate, *statusResp2.NextDueDate)
		}
	}

	// 6. A newly uploaded document is used in the regular cycle: it must NOT trigger re-certification
	time.Sleep(10 * time.Millisecond) // ensure time ordering
	docNew := models.HygieneInstructionDocument{
		Filename:      "new_policy.pdf",
		MimeType:      "application/pdf",
		FileSize:      20,
		FileData:      []byte("%PDF-1.4 new version"),
		Title:         "Neufassung",
		EffectiveFrom: time.Now().UTC(),
	}
	_, err = s.Store.SaveHygieneInstructionDocument(ctx, docNew, "admin@example.com")
	if err != nil {
		t.Fatalf("SaveHygieneInstructionDocument failed: %v", err)
	}

	recStatus3 := httptest.NewRecorder()
	s.HandleGetMyHygieneStatus(recStatus3, reqStatus)
	var statusResp3 models.HygieneUserStatusResponse
	if err := json.Unmarshal(recStatus3.Body.Bytes(), &statusResp3); err != nil {
		t.Fatalf("failed to decode status response 3: %v", err)
	}
	if statusResp3.NeedsInstruction {
		t.Errorf("expected NeedsInstruction = false: a new document is only used in the regular cycle")
	}
}

func TestHygiene_DocumentListAndDelete(t *testing.T) {
	s, pool := setupHygieneTestServer(t)
	defer pool.Close()
	ctx := context.Background()

	adminUser := &models.UserWithPermissions{
		Email:                "hygieneadmin@example.com",
		EffectivePermissions: []string{"hygiene.infektionsschutz.management"},
	}

	// 1. Upload doc 1
	doc1 := models.HygieneInstructionDocument{
		Filename:      "doc1.pdf",
		MimeType:      "application/pdf",
		FileSize:      15,
		FileData:      []byte("%PDF-1.4 doc1"),
		Title:         "Doc 1",
		EffectiveFrom: time.Now().UTC(),
	}
	saved1, err := s.Store.SaveHygieneInstructionDocument(ctx, doc1, adminUser.Email)
	if err != nil {
		t.Fatalf("failed to save doc1: %v", err)
	}

	time.Sleep(10 * time.Millisecond)

	// 2. Upload doc 2
	doc2 := models.HygieneInstructionDocument{
		Filename:      "doc2.pdf",
		MimeType:      "application/pdf",
		FileSize:      15,
		FileData:      []byte("%PDF-1.4 doc2"),
		Title:         "Doc 2",
		EffectiveFrom: time.Now().UTC(),
	}
	saved2, err := s.Store.SaveHygieneInstructionDocument(ctx, doc2, adminUser.Email)
	if err != nil {
		t.Fatalf("failed to save doc2: %v", err)
	}

	// 3. List documents
	reqList := httptest.NewRequest(http.MethodGet, "/api/hygiene/instruction-documents", nil)
	reqList = reqList.WithContext(context.WithValue(ctx, auth.UserContextKey, adminUser))
	recList := httptest.NewRecorder()
	s.HandleListHygieneDocuments(recList, reqList)

	if recList.Code != http.StatusOK {
		t.Fatalf("HandleListHygieneDocuments failed: code %d", recList.Code)
	}
	var listResp struct {
		Documents []models.HygieneInstructionDocumentInfo `json:"documents"`
	}
	if err := json.Unmarshal(recList.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("failed to unmarshal list: %v", err)
	}
	if len(listResp.Documents) < 2 {
		t.Fatalf("expected at least 2 documents, got %d", len(listResp.Documents))
	}
	if listResp.Documents[0].ID != saved2.ID || !listResp.Documents[0].IsActive {
		t.Errorf("expected newest document (doc2) to be active version")
	}

	// 4. Delete doc 2
	r := chi.NewRouter()
	r.Delete("/api/hygiene/instruction-document/{id}", s.HandleDeleteHygieneDocument)

	delURL := "/api/hygiene/instruction-document/" + saved2.ID.String()
	reqDel := httptest.NewRequest(http.MethodDelete, delURL, nil)
	reqDel = reqDel.WithContext(context.WithValue(ctx, auth.UserContextKey, adminUser))
	recDel := httptest.NewRecorder()
	r.ServeHTTP(recDel, reqDel)

	if recDel.Code != http.StatusOK {
		t.Fatalf("HandleDeleteHygieneDocument failed: code %d", recDel.Code)
	}

	// 5. List again: doc 2 should be gone, and doc 1 should now be active
	recList2 := httptest.NewRecorder()
	s.HandleListHygieneDocuments(recList2, reqList)
	var listResp2 struct {
		Documents []models.HygieneInstructionDocumentInfo `json:"documents"`
	}
	if err := json.Unmarshal(recList2.Body.Bytes(), &listResp2); err != nil {
		t.Fatalf("failed to unmarshal list 2: %v", err)
	}
	for _, d := range listResp2.Documents {
		if d.ID == saved2.ID {
			t.Errorf("deleted doc2 still appeared in documents list")
		}
	}
	if len(listResp2.Documents) > 0 && listResp2.Documents[0].ID == saved1.ID {
		if !listResp2.Documents[0].IsActive {
			t.Errorf("expected doc1 to become active version after doc2 deletion")
		}
	}
}

func TestHygiene_DeletedDocumentInParentEvents(t *testing.T) {
	s, pool := setupHygieneTestServer(t)
	defer pool.Close()
	ctx := context.Background()

	// 1. Create family & parent
	famID := uuid.New()
	_, err := pool.Exec(ctx, "INSERT INTO families (id) VALUES ($1)", famID)
	if err != nil {
		t.Fatalf("failed to insert family: %v", err)
	}
	parentID := uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO parents (id, family_id, first_name, last_name, emails)
		VALUES ($1, $2, 'DeletedDoc', 'Tester', '[{"value": "deleted.doc@example.com", "identifier_email": true}]'::jsonb)
	`, parentID, famID)
	if err != nil {
		t.Fatalf("failed to insert parent: %v", err)
	}

	// 2. Save doc & certify
	doc := models.HygieneInstructionDocument{
		Filename:      "will_be_deleted.pdf",
		MimeType:      "application/pdf",
		FileSize:      10,
		FileData:      []byte("%PDF-1.4 delete test"),
		Title:         "Ephemeral Document",
		EffectiveFrom: time.Now().UTC(),
	}
	savedDoc, err := s.Store.SaveHygieneInstructionDocument(ctx, doc, "admin@example.com")
	if err != nil {
		t.Fatalf("failed to save doc: %v", err)
	}

	user := &models.UserWithPermissions{
		ID:                   uuid.Nil,
		Email:                "deleted.doc@example.com",
		FamilyID:             &famID,
		ParentID:             &parentID,
		EffectivePermissions: []string{"hygiene.infektionsschutz.self"},
	}
	reqCert := httptest.NewRequest(http.MethodPost, "/api/hygiene/certify", bytes.NewBufferString(`{"confirmed": true}`))
	reqCert.Header.Set("Content-Type", "application/json")
	reqCert = reqCert.WithContext(context.WithValue(ctx, auth.UserContextKey, user))
	recCert := httptest.NewRecorder()
	s.HandleCertifyHygieneInstruction(recCert, reqCert)

	if recCert.Code != http.StatusOK {
		t.Fatalf("HandleCertifyHygieneInstruction failed: code %d", recCert.Code)
	}

	// 3. Delete document
	err = s.Store.SoftDeleteHygieneInstructionDocument(ctx, savedDoc.ID, uuid.Nil, "admin@example.com")
	if err != nil {
		t.Fatalf("SoftDeleteHygieneInstructionDocument failed: %v", err)
	}

	// 4. Fetch families via ListFamilies - the parent event should have document_deleted = true
	fams, err := s.Store.ListFamilies(ctx)
	if err != nil {
		t.Fatalf("ListFamilies failed: %v", err)
	}

	var foundParent *models.Parent
	for _, f := range fams {
		for _, p := range f.Parents {
			if p.ID == parentID {
				foundParent = &p
				break
			}
		}
	}
	if foundParent == nil {
		t.Fatalf("parent not found in GetParents")
	}
	if len(foundParent.Events) == 0 {
		t.Fatalf("expected parent to have events")
	}
	if !foundParent.Events[0].DocumentDeleted {
		t.Errorf("expected parent event DocumentDeleted to be true after document was deleted")
	}
}

func TestHygiene_ReminderAndDueDateWindow(t *testing.T) {
	s, pool := setupHygieneTestServer(t)
	defer pool.Close()
	ctx := context.Background()

	// 1. Ensure an active document exists
	doc := models.HygieneInstructionDocument{
		Filename:      "doc_window.pdf",
		MimeType:      "application/pdf",
		FileSize:      15,
		FileData:      []byte("%PDF-1.4 test"),
		Title:         "Turnus Test",
		EffectiveFrom: time.Now().UTC().AddDate(-2, 0, 0),
	}
	savedDoc, err := s.Store.SaveHygieneInstructionDocument(ctx, doc, "admin@example.com")
	if err != nil {
		t.Fatalf("failed to save doc: %v", err)
	}

	famID := uuid.New()
	parentID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO families (id) VALUES ($1)", famID)
	_, _ = pool.Exec(ctx, `INSERT INTO parents (id, family_id, first_name, last_name, emails)
		VALUES ($1, $2, 'Window', 'Tester', '[{"value": "window@example.com", "identifier_email": true}]')`, parentID, famID)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM families WHERE id = $1", famID)
	}()

	parentUser := &models.UserWithPermissions{
		ID:                   uuid.Nil,
		Email:                "window@example.com",
		FamilyID:             &famID,
		ParentID:             &parentID,
		EffectivePermissions: []string{"hygiene.infektionsschutz.self"},
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)

	// Scenario A: Event recorded 10 months ago (not yet in reminder window)
	date10MoAgo := today.AddDate(0, -10, 0)
	_, err = pool.Exec(ctx, `
		INSERT INTO hygiene_belehrung_events (parent_id, document_id, event_date, event_type, documentation)
		VALUES ($1, $2, $3, 'recertify', 'tester')
	`, parentID, savedDoc.ID, date10MoAgo)
	if err != nil {
		t.Fatalf("failed to insert 10-month event: %v", err)
	}

	reqA := httptest.NewRequest(http.MethodGet, "/api/hygiene/my-status", nil)
	reqA = reqA.WithContext(context.WithValue(ctx, auth.UserContextKey, parentUser))
	recA := httptest.NewRecorder()
	s.HandleGetMyHygieneStatus(recA, reqA)
	if recA.Code != http.StatusOK {
		t.Fatalf("status code %d", recA.Code)
	}
	var respA models.HygieneUserStatusResponse
	_ = json.Unmarshal(recA.Body.Bytes(), &respA)

	expectedDueDateA := date10MoAgo.AddDate(0, 12, 0).Format("2006-01-02")
	if respA.NextDueDate == nil || *respA.NextDueDate != expectedDueDateA {
		t.Errorf("expected NextDueDate = %s, got %v", expectedDueDateA, respA.NextDueDate)
	}
	if respA.NeedsInstruction {
		t.Errorf("expected NeedsInstruction = false when certified 10 months ago (reminder starts at 11 months)")
	}

	// Scenario B: Event recorded 11 months ago (in reminder window!)
	date11MoAgo := today.AddDate(0, -11, 0)
	_, _ = pool.Exec(ctx, "DELETE FROM hygiene_belehrung_events WHERE parent_id = $1", parentID)
	_, err = pool.Exec(ctx, `
		INSERT INTO hygiene_belehrung_events (parent_id, document_id, event_date, event_type, documentation)
		VALUES ($1, $2, $3, 'recertify', 'tester')
	`, parentID, savedDoc.ID, date11MoAgo)
	if err != nil {
		t.Fatalf("failed to insert 11-month event: %v", err)
	}

	recB := httptest.NewRecorder()
	s.HandleGetMyHygieneStatus(recB, reqA)
	var respB models.HygieneUserStatusResponse
	_ = json.Unmarshal(recB.Body.Bytes(), &respB)

	expectedDueDateB := date11MoAgo.AddDate(0, 12, 0).Format("2006-01-02")
	if respB.NextDueDate == nil || *respB.NextDueDate != expectedDueDateB {
		t.Errorf("expected NextDueDate = %s, got %v", expectedDueDateB, respB.NextDueDate)
	}
	if !respB.NeedsInstruction {
		t.Errorf("expected NeedsInstruction = true when certified 11 months ago (1 month before 12-month due date)")
	}
}

func TestHygiene_DueDateFromFamilyStartDate(t *testing.T) {
	s, pool := setupHygieneTestServer(t)
	defer pool.Close()
	ctx := context.Background()

	if _, err := s.Store.SaveHygieneInstructionDocument(ctx, models.HygieneInstructionDocument{
		Filename:      "doc_family_start.pdf",
		MimeType:      "application/pdf",
		FileSize:      15,
		FileData:      []byte("%PDF-1.4 test"),
		Title:         "Family start",
		EffectiveFrom: time.Now().UTC().AddDate(-2, 0, 0),
	}, "admin@example.com"); err != nil {
		t.Fatalf("failed to save doc: %v", err)
	}

	famID := uuid.New()
	parentID := uuid.New()
	_, _ = pool.Exec(ctx, "INSERT INTO families (id) VALUES ($1)", famID)
	_, _ = pool.Exec(ctx, `INSERT INTO parents (id, family_id, first_name, last_name, emails)
		VALUES ($1, $2, 'Family', 'Start', '[{"value": "familystart@example.com", "identifier_email": true}]')`, parentID, famID)
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM families WHERE id = $1", famID)
	}()

	getStatus := func() models.HygieneUserStatusResponse {
		st, err := s.Store.GetParentHygieneStatus(ctx, parentID)
		if err != nil {
			t.Fatalf("GetParentHygieneStatus failed: %v", err)
		}
		return *st
	}

	// No children / no group start and no certification: no due date can be derived
	st := getStatus()
	if st.NextDueDate != nil || st.NeedsInstruction {
		t.Errorf("expected no due date and no instruction need without group start, got %+v", st)
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	addChild := func(startMonthsAgo int, exitOnly bool) {
		childID := uuid.New()
		_, err := pool.Exec(ctx, `INSERT INTO children (id, family_id, first_name, last_name, birth_date)
			VALUES ($1, $2, 'Kind', 'Test', '2021-01-01')`, childID, famID)
		if err != nil {
			t.Fatalf("failed to insert child: %v", err)
		}
		group := 1
		if exitOnly {
			group = 0
		}
		_, err = pool.Exec(ctx, `INSERT INTO children_group_changes (child, change_date, target_group)
			VALUES ($1, $2, $3)`, childID, today.AddDate(0, -startMonthsAgo, 0), group)
		if err != nil {
			t.Fatalf("failed to insert group change: %v", err)
		}
	}

	// Child that only has an exit entry (group 0) is ignored; child started 3 months ago
	addChild(20, true)
	addChild(3, false)
	st = getStatus()
	expected := today.AddDate(0, -3, 0).AddDate(0, 12, 0).Format("2006-01-02")
	if st.NextDueDate == nil || *st.NextDueDate != expected {
		t.Errorf("expected NextDueDate = %s (earliest group start 3 months ago + 12m), got %v", expected, st.NextDueDate)
	}
	if st.NeedsInstruction {
		t.Errorf("expected NeedsInstruction = false 3 months after family start")
	}
	if st.LastInstructionDate != nil {
		t.Errorf("expected no last instruction date")
	}

	// A second child that started 11 months ago determines the family start
	addChild(11, false)
	st = getStatus()
	expected = today.AddDate(0, -11, 0).AddDate(0, 12, 0).Format("2006-01-02")
	if st.NextDueDate == nil || *st.NextDueDate != expected {
		t.Errorf("expected NextDueDate = %s (earliest group start), got %v", expected, st.NextDueDate)
	}
	if !st.NeedsInstruction {
		t.Errorf("expected NeedsInstruction = true 11 months after family start")
	}

	// Once the parent has certified, the latest certification date + 12m wins over the family start date
	_, err := pool.Exec(ctx, `INSERT INTO hygiene_belehrung_events (parent_id, event_date, event_type, documentation)
		VALUES ($1, $2, 'recertify', 'tester')`, parentID, today.AddDate(0, -1, 0))
	if err != nil {
		t.Fatalf("failed to insert event: %v", err)
	}
	st = getStatus()
	expected = today.AddDate(0, -1, 0).AddDate(0, 12, 0).Format("2006-01-02")
	if st.NextDueDate == nil || *st.NextDueDate != expected {
		t.Errorf("expected NextDueDate = %s (last certification + 12m), got %v", expected, st.NextDueDate)
	}
	if st.NeedsInstruction {
		t.Errorf("expected NeedsInstruction = false after recent certification")
	}
}
