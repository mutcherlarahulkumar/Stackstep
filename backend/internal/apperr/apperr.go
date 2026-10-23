// Package apperr defines the closed set of API error codes and the error type carrying them.
package apperr

import (
	"errors"
	"net/http"
)

// Code is a machine-readable error code. Clients map each code to their own copy.
type Code string

const (
	CodeBadRequest          Code = "bad_request"
	CodePayloadTooLarge     Code = "payload_too_large"
	CodeUnauthenticated     Code = "unauthenticated"
	CodeForbidden           Code = "forbidden"
	CodeNotFound            Code = "not_found"
	CodeValidationFailed    Code = "validation_failed"
	CodeInvalidTransition   Code = "invalid_transition"
	CodeVersionConflict     Code = "version_conflict"
	CodeEnrollmentNotActive Code = "enrollment_not_active"
	CodeNoActiveEnrollment  Code = "no_active_enrollment"
	CodeRateLimited         Code = "rate_limited"
	CodeInvalidState        Code = "invalid_state"
	CodeInvalidCode         Code = "invalid_code"
	CodeNotConfigured       Code = "not_configured"
	CodeInsufficientCredits Code = "insufficient_credits"
	CodeAIUnavailable       Code = "ai_unavailable"
	CodeInternal            Code = "internal"
)

// Status maps a code to its HTTP status.
func (c Code) Status() int {
	switch c {
	case CodeBadRequest, CodeInvalidState:
		return http.StatusBadRequest
	case CodePayloadTooLarge:
		return http.StatusRequestEntityTooLarge
	case CodeUnauthenticated, CodeInvalidCode:
		return http.StatusUnauthorized
	case CodeForbidden:
		return http.StatusForbidden
	case CodeNotFound:
		return http.StatusNotFound
	case CodeValidationFailed, CodeInvalidTransition, CodeEnrollmentNotActive:
		return http.StatusUnprocessableEntity
	case CodeVersionConflict, CodeNoActiveEnrollment:
		return http.StatusConflict
	case CodeRateLimited:
		return http.StatusTooManyRequests
	case CodeInsufficientCredits:
		return http.StatusPaymentRequired
	case CodeNotConfigured, CodeAIUnavailable:
		return http.StatusServiceUnavailable
	case CodeInternal:
		return http.StatusInternalServerError
	}
	return http.StatusInternalServerError
}

// Error is an API-facing error.
type Error struct {
	Code              Code
	Message           string
	Fields            map[string]string
	RetryAfterSeconds int
}

func (e *Error) Error() string { return string(e.Code) + ": " + e.Message }

// New returns an Error with a code and message.
func New(code Code, msg string) *Error { return &Error{Code: code, Message: msg} }

// Validation returns a validation_failed error with per-field messages.
func Validation(fields map[string]string) *Error {
	return &Error{Code: CodeValidationFailed, Message: "Some fields are invalid.", Fields: fields}
}

// As extracts an *Error from err, if any.
func As(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}
