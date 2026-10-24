package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/apperr"
)

// MaxBodyBytes caps every request body.
const MaxBodyBytes = 64 << 10

// MaxImportBodyBytes caps a bulk enrollment (500 rows with long names and emails).
const MaxImportBodyBytes = 512 << 10

// MaxNoteBodyBytes fits a 20,000-character note in any script, JSON-escaped.
const MaxNoteBodyBytes = 128 << 10

type errorBody struct {
	Error errorPayload `json:"error"`
}

type errorPayload struct {
	Code              apperr.Code       `json:"code"`
	Message           string            `json:"message"`
	Fields            map[string]string `json:"fields,omitempty"`
	RetryAfterSeconds *int              `json:"retry_after_seconds,omitempty"`
	RequestID         string            `json:"request_id,omitempty"`
}

// fail writes the error envelope. Unknown errors become 500 without leaking details.
func (s *Server) fail(c *gin.Context, err error) {
	e, ok := apperr.As(err)
	if !ok {
		s.log.ErrorContext(c.Request.Context(), "internal error", "err", err, "path", c.FullPath(), "request_id", c.GetString(ctxRequestID))
		e = apperr.New(apperr.CodeInternal, "Something went wrong on our side.")
	}
	p := errorPayload{Code: e.Code, Message: e.Message, Fields: e.Fields, RequestID: c.GetString(ctxRequestID)}
	if e.RetryAfterSeconds > 0 {
		v := e.RetryAfterSeconds
		p.RetryAfterSeconds = &v
		c.Header("Retry-After", strconv.Itoa(v))
	}
	c.AbortWithStatusJSON(e.Code.Status(), errorBody{Error: p})
}

// decode strictly parses a JSON body: one object, no unknown fields, bounded size.
func decode(c *gin.Context, dst any) error { return decodeLimit(c, dst, MaxBodyBytes) }

// decodeLimit is decode with a custom size cap.
func decodeLimit(c *gin.Context, dst any, limit int64) error {
	if ct := c.ContentType(); ct != "application/json" {
		return apperr.New(apperr.CodeBadRequest, "Content-Type must be application/json.")
	}
	r := http.MaxBytesReader(c.Writer, c.Request.Body, limit)
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return decodeError(err)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return apperr.New(apperr.CodeBadRequest, "Body must contain a single JSON object.")
	}
	return nil
}

func decodeError(err error) error {
	var maxErr *http.MaxBytesError
	var syntaxErr *json.SyntaxError
	var typeErr *json.UnmarshalTypeError
	switch {
	case errors.As(err, &maxErr):
		return apperr.New(apperr.CodePayloadTooLarge, "Request body is too large.")
	case errors.As(err, &syntaxErr), errors.Is(err, io.ErrUnexpectedEOF):
		return apperr.New(apperr.CodeBadRequest, "Malformed JSON.")
	case errors.As(err, &typeErr):
		return &apperr.Error{Code: apperr.CodeBadRequest, Message: "Wrong type for a field.",
			Fields: map[string]string{typeErr.Field: fmt.Sprintf("Expected %s.", typeErr.Type)}}
	case errors.Is(err, io.EOF):
		return apperr.New(apperr.CodeBadRequest, "Request body is empty.")
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		field := strings.Trim(strings.TrimPrefix(err.Error(), "json: unknown field "), `"`)
		return &apperr.Error{Code: apperr.CodeBadRequest, Message: "Unknown field.", Fields: map[string]string{field: "Unknown field."}}
	}
	// time.Time and uuid.UUID parse errors surface here.
	return apperr.New(apperr.CodeBadRequest, "Invalid value in request body.")
}

func queryInt(c *gin.Context, key string, def int) (int, bool) {
	raw, ok := c.GetQuery(key)
	if !ok || raw == "" {
		return def, true
	}
	n, err := strconv.Atoi(raw)
	return n, err == nil
}
