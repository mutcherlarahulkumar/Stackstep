// Package ghpr reads a public GitHub pull request (title, description, size and diff) so an
// AI review draft can look at the actual change. It never writes to GitHub.
package ghpr

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Ref identifies a pull request.
type Ref struct {
	Owner, Repo string
	Number      int
}

// Parse reads a github.com pull request URL ("https://github.com/o/r/pull/12", with or
// without a trailing path like "/files"). ok is false for anything else.
func Parse(raw string) (Ref, bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || !strings.EqualFold(u.Host, "github.com") {
		return Ref{}, false
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 4 || parts[2] != "pull" {
		return Ref{}, false
	}
	n, err := strconv.Atoi(parts[3])
	if err != nil || n <= 0 || parts[0] == "" || parts[1] == "" {
		return Ref{}, false
	}
	return Ref{Owner: parts[0], Repo: parts[1], Number: n}, true
}

// PR is what a review draft needs to know about a pull request.
type PR struct {
	Title        string
	Body         string
	State        string // open or closed
	Merged       bool
	Additions    int
	Deletions    int
	ChangedFiles int
	Diff         string // unified diff, cut to MaxDiffBytes
	Truncated    bool
}

// MaxDiffBytes bounds the diff sent to the model.
const MaxDiffBytes = 48 << 10

// ErrNotReadable means the PR is private, gone, or GitHub refused (rate limit, outage).
var ErrNotReadable = errors.New("ghpr: pull request not readable")

// Client calls the GitHub REST API.
type Client struct {
	BaseURL string // https://api.github.com
	Token   string // optional
	HTTP    *http.Client
}

// Get fetches a pull request and its diff.
func (c *Client) Get(ctx context.Context, ref Ref) (PR, error) {
	path := fmt.Sprintf("/repos/%s/%s/pulls/%d", url.PathEscape(ref.Owner), url.PathEscape(ref.Repo), ref.Number)
	var meta struct {
		Title        string `json:"title"`
		Body         string `json:"body"`
		State        string `json:"state"`
		Merged       bool   `json:"merged"`
		Additions    int    `json:"additions"`
		Deletions    int    `json:"deletions"`
		ChangedFiles int    `json:"changed_files"`
	}
	raw, _, err := c.get(ctx, path, "application/vnd.github+json", 1<<20)
	if err != nil {
		return PR{}, err
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		return PR{}, fmt.Errorf("%w: bad response", ErrNotReadable)
	}
	diff, truncated, err := c.get(ctx, path, "application/vnd.github.diff", MaxDiffBytes)
	if err != nil {
		return PR{}, err
	}
	return PR{Title: meta.Title, Body: meta.Body, State: meta.State, Merged: meta.Merged, Additions: meta.Additions,
		Deletions: meta.Deletions, ChangedFiles: meta.ChangedFiles, Diff: string(diff), Truncated: truncated}, nil
}

func (c *Client) get(ctx context.Context, path, accept string, limit int64) ([]byte, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.BaseURL, "/")+path, nil)
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, false, fmt.Errorf("%w: %w", ErrNotReadable, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, false, fmt.Errorf("%w: status %d", ErrNotReadable, res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil {
		return nil, false, fmt.Errorf("%w: read: %w", ErrNotReadable, err)
	}
	if int64(len(body)) > limit {
		return body[:limit], true, nil
	}
	return body, false, nil
}
