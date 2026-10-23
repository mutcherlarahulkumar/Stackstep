package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// GitHubProfile is the subset of a GitHub account Stackstep stores.
type GitHubProfile struct {
	ID        int64
	Login     string
	Name      string
	Email     *string
	AvatarURL *string
}

// GitHub exchanges OAuth codes and reads the signed-in user's profile.
type GitHub struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	OAuthBaseURL string
	APIBaseURL   string
	HTTP         *http.Client
}

// AuthorizeURL returns the GitHub consent URL for state.
func (g *GitHub) AuthorizeURL(state string) string {
	q := url.Values{
		"client_id":    {g.ClientID},
		"redirect_uri": {g.RedirectURL},
		"scope":        {"read:user user:email"},
		"state":        {state},
		"allow_signup": {"true"},
	}
	return strings.TrimRight(g.OAuthBaseURL, "/") + "/login/oauth/authorize?" + q.Encode()
}

// Exchange trades an authorization code for the user's profile.
func (g *GitHub) Exchange(ctx context.Context, code string) (GitHubProfile, error) {
	form := url.Values{
		"client_id":     {g.ClientID},
		"client_secret": {g.ClientSecret},
		"code":          {code},
		"redirect_uri":  {g.RedirectURL},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(g.OAuthBaseURL, "/")+"/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return GitHubProfile{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	var tok struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := g.do(req, &tok); err != nil {
		return GitHubProfile{}, fmt.Errorf("exchange code: %w", err)
	}
	if tok.AccessToken == "" {
		return GitHubProfile{}, fmt.Errorf("exchange code: github error %q", tok.Error)
	}

	var u struct {
		ID        int64   `json:"id"`
		Login     string  `json:"login"`
		Name      *string `json:"name"`
		Email     *string `json:"email"`
		AvatarURL *string `json:"avatar_url"`
	}
	if err := g.get(ctx, "/user", tok.AccessToken, &u); err != nil {
		return GitHubProfile{}, fmt.Errorf("read user: %w", err)
	}
	if u.ID <= 0 || u.Login == "" || len(u.Login) > 39 {
		return GitHubProfile{}, errors.New("read user: github returned an invalid profile")
	}
	p := GitHubProfile{ID: u.ID, Login: u.Login, Name: u.Login, AvatarURL: u.AvatarURL}
	if u.Name != nil && strings.TrimSpace(*u.Name) != "" {
		p.Name = strings.TrimSpace(*u.Name)
	}
	if u.Email != nil && *u.Email != "" {
		p.Email = u.Email
	} else {
		var emails []struct {
			Email    string `json:"email"`
			Primary  bool   `json:"primary"`
			Verified bool   `json:"verified"`
		}
		if err := g.get(ctx, "/user/emails", tok.AccessToken, &emails); err == nil {
			for _, e := range emails {
				if e.Primary && e.Verified && len(e.Email) <= 320 {
					email := e.Email
					p.Email = &email
					break
				}
			}
		}
	}
	return p, nil
}

func (g *GitHub) get(ctx context.Context, path, token string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(g.APIBaseURL, "/")+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	return g.do(req, out)
}

func (g *GitHub) do(req *http.Request, out any) error {
	client := g.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("github status %d", res.StatusCode)
	}
	return json.Unmarshal(body, out)
}
