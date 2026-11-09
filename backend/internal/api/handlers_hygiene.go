package api

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/pavolmarko/thweb-backend/internal/auth"
	"github.com/pavolmarko/thweb-backend/internal/models"
)

// resolveParentIDForUser returns the parent ID for the given user, looking it up if needed.
func (s *Server) resolveParentIDForUser(ctx context.Context, user *models.UserWithPermissions) (*uuid.UUID, error) {
	if user == nil {
		return nil, nil
	}
	if user.ParentID != nil && *user.ParentID != uuid.Nil {
		return user.ParentID, nil
	}
	parentID, _, err := s.Store.GetParentInfoByIdentifierEmail(ctx, user.Email)
	if err != nil {
		return nil, err
	}
	if parentID != nil {
		return parentID, nil
	}

	if s.Authenticator != nil && s.Authenticator.AllowMockAuth && user.Email == "developer@example.com" {
		devParentID, err := s.Store.EnsureMockParentForDeveloper(ctx)
		if err != nil {
			return nil, err
		}
		return devParentID, nil
	}

	return nil, nil
}

// HandleGetMyHygieneStatus returns the current user's hygiene belehrung status.
func (s *Server) HandleGetMyHygieneStatus(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	activeDoc, err := s.Store.GetActiveHygieneInstructionDocumentInfo(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to get active hygiene document info", http.StatusInternalServerError, err)
		return
	}

	parentID, err := s.resolveParentIDForUser(r.Context(), user)
	if err != nil {
		httpErrorLog(w, r, "Failed to resolve parent info", http.StatusInternalServerError, err)
		return
	}

	if parentID == nil {
		// User is not associated with a parent record
		jsonResponse(w, models.HygieneUserStatusResponse{
			IsParent:          false,
			NeedsInstruction:  false,
			DocumentAvailable: activeDoc != nil,
			DocumentInfo:      activeDoc,
		})
		return
	}

	status, err := s.Store.GetParentHygieneStatus(r.Context(), *parentID)
	if err != nil {
		httpErrorLog(w, r, "Failed to get parent hygiene status", http.StatusInternalServerError, err)
		return
	}

	jsonResponse(w, status)
}

// HandleGetActiveHygieneDocument streams the currently active hygiene instruction PDF.
func (s *Server) HandleGetActiveHygieneDocument(w http.ResponseWriter, r *http.Request) {
	doc, err := s.Store.GetActiveHygieneInstructionDocument(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to fetch active hygiene document", http.StatusInternalServerError, err)
		return
	}
	if doc == nil || len(doc.FileData) == 0 {
		http.Error(w, "No active hygiene instruction document found", http.StatusNotFound)
		return
	}

	filename := doc.Filename
	if filename == "" {
		filename = "Hygiene-Folgebelehrung.pdf"
	}

	w.Header().Set("Content-Type", doc.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", doc.FileSize))
	w.Header().Set("Cache-Control", "private, max-age=900")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(doc.FileData)
}

// HandleGetHygieneDocumentByID streams a specific hygiene instruction PDF by its UUID.
func (s *Server) HandleGetHygieneDocumentByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	docID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	doc, err := s.Store.GetHygieneInstructionDocumentByID(r.Context(), docID)
	if err != nil {
		httpErrorLog(w, r, "Failed to fetch hygiene document", http.StatusInternalServerError, err)
		return
	}
	if doc == nil || len(doc.FileData) == 0 {
		http.Error(w, "Hygiene document not found", http.StatusNotFound)
		return
	}

	filename := doc.Filename
	if filename == "" {
		filename = "Hygiene-Folgebelehrung.pdf"
	}

	w.Header().Set("Content-Type", doc.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", doc.FileSize))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(doc.FileData)
}

// HandleGetActiveHygieneDocumentInfo returns metadata of the active document without raw bytes.
func (s *Server) HandleGetActiveHygieneDocumentInfo(w http.ResponseWriter, r *http.Request) {
	info, err := s.Store.GetActiveHygieneInstructionDocumentInfo(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to fetch document info", http.StatusInternalServerError, err)
		return
	}
	if info == nil {
		jsonResponse(w, map[string]interface{}{
			"document_available": false,
		})
		return
	}

	jsonResponse(w, map[string]interface{}{
		"document_available": true,
		"document_info":      info,
	})
}

// HandleUploadHygieneDocument handles direct multipart PDF file uploads.
func (s *Server) HandleUploadHygieneDocument(w http.ResponseWriter, r *http.Request) {
	// Max upload size 20 MB
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		httpErrorLog(w, r, "File exceeds maximum allowed size of 20MB", http.StatusBadRequest, err)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpErrorLog(w, r, "Missing file in multipart form", http.StatusBadRequest, err)
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		httpErrorLog(w, r, "Failed to read uploaded file", http.StatusInternalServerError, err)
		return
	}

	if len(fileBytes) < 4 || !bytes.HasPrefix(fileBytes, []byte("%PDF")) {
		http.Error(w, "Invalid file format: Only valid PDF documents are allowed", http.StatusBadRequest)
		return
	}

	title := strings.TrimSpace(r.FormValue("title"))
	if title == "" {
		title = header.Filename
	}

	actorEmail := getActorEmail(r)
	doc := models.HygieneInstructionDocument{
		Filename:                         header.Filename,
		MimeType:                         "application/pdf",
		FileSize:                         int64(len(fileBytes)),
		FileData:                         fileBytes,
		Title:                            title,
		SourceType:                       "upload",
		EffectiveFrom:                    time.Now().UTC(),
	}

	savedInfo, err := s.Store.SaveHygieneInstructionDocument(r.Context(), doc, actorEmail)
	if err != nil {
		httpErrorLog(w, r, "Failed to save instruction document", http.StatusInternalServerError, err)
		return
	}

	jsonResponse(w, savedInfo)
}



// HandleCertifyHygieneInstruction records an online self-certification event for the current parent.
func (s *Server) HandleCertifyHygieneInstruction(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	parentID, err := s.resolveParentIDForUser(r.Context(), user)
	if err != nil {
		httpErrorLog(w, r, "Failed to resolve parent info", http.StatusInternalServerError, err)
		return
	}
	if parentID == nil {
		http.Error(w, "Forbidden: Only registered parents can self-certify", http.StatusForbidden)
		return
	}

	activeDoc, err := s.Store.GetActiveHygieneInstructionDocumentInfo(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to check active document", http.StatusInternalServerError, err)
		return
	}
	if activeDoc == nil {
		http.Error(w, "Bad Request: No active hygiene instruction document is currently configured", http.StatusBadRequest)
		return
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	docTitle := activeDoc.Title
	if docTitle == "" {
		docTitle = activeDoc.Filename
	}

	event := models.HygieneBelehrungEvent{
		ParentID:      *parentID,
		EventDate:     today,
		EventType:     "recertify",
		Documentation: fmt.Sprintf("Online-Folgebelehrung gemäß § 43 IfSG bestätigt (Dokument: %s)", docTitle),
		DocumentID:    &activeDoc.ID,
	}

	actorEmail := getActorEmail(r)
	created, err := s.Store.CreateHygieneEvent(r.Context(), user.ID, event, actorEmail)
	if err != nil {
		httpErrorLog(w, r, "Failed to record hygiene certification", http.StatusInternalServerError, err)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"success": true,
		"event":   created,
	})
}

// HandleListHygieneDocuments returns a list of all active/historical non-deleted instruction documents.
func (s *Server) HandleListHygieneDocuments(w http.ResponseWriter, r *http.Request) {
	docs, err := s.Store.GetAllHygieneInstructionDocuments(r.Context())
	if err != nil {
		httpErrorLog(w, r, "Failed to list hygiene instruction documents", http.StatusInternalServerError, err)
		return
	}
	if docs == nil {
		docs = []models.HygieneInstructionDocumentInfo{}
	}
	jsonResponse(w, map[string]interface{}{
		"documents": docs,
	})
}

// HandleDeleteHygieneDocument soft-deletes a hygiene instruction document.
func (s *Server) HandleDeleteHygieneDocument(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	docID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	user := auth.GetUser(r.Context())
	actorEmail := getActorEmail(r)
	var userID uuid.UUID
	if user != nil {
		userID = user.ID
	}

	if err := s.Store.SoftDeleteHygieneInstructionDocument(r.Context(), docID, userID, actorEmail); err != nil {
		httpErrorLog(w, r, "Failed to delete hygiene instruction document", http.StatusInternalServerError, err)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"success": true,
	})
}


