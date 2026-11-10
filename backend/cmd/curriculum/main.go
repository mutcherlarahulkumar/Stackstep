// Command curriculum previews or imports the guided React curriculum without resetting data.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/db"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
	curriculum "github.com/mutcherlarahulkumar/stackstep/backend/internal/guidedcurriculum"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "curriculum:", err)
		os.Exit(1)
	}
}

type exportedTask struct {
	Day              int                `json:"day"`
	EstimatedMinutes int                `json:"estimated_minutes"`
	Type             domain.TaskType    `json:"type"`
	Title            string             `json:"title"`
	Brief            string             `json:"brief"`
	ReviewMode       domain.ReviewMode  `json:"review_mode"`
	Content          domain.TaskContent `json:"content"`
}

func run(args []string, out io.Writer) error {
	fs := flag.NewFlagSet("curriculum", flag.ContinueOnError)
	apply := fs.Bool("apply", false, "import a new edition; existing editions and assignments are never overwritten")
	asJSON := fs.Bool("json", false, "export the curriculum preview as JSON without connecting to a database")
	login := fs.String("admin-login", "", "existing platform admin GitHub login, required with --apply")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	if *apply && *asJSON {
		return errors.New("--json previews only; use --apply separately")
	}
	entries, err := curriculum.Entries(curriculum.ImportPersonas())
	if err != nil {
		return err
	}
	if *asJSON {
		tasks := make([]exportedTask, 0, len(entries))
		for _, entry := range entries {
			tasks = append(tasks, exportedTask{Day: entry.Day, EstimatedMinutes: entry.EstimatedMinutes, Type: entry.Spec.Type, Title: entry.Spec.Title, Brief: entry.Spec.Brief, ReviewMode: entry.Spec.ReviewMode, Content: entry.Spec.Content})
		}
		return json.NewEncoder(out).Encode(struct {
			Version string         `json:"version"`
			Name    string         `json:"name"`
			Days    int            `json:"days"`
			Tasks   []exportedTask `json:"tasks"`
		}{curriculum.Version, curriculum.Name, 30, tasks})
	}
	if !*apply {
		fmt.Fprintf(out, "Preview %s: %s\n30 days, %d tasks; no database connection or writes.\n", curriculum.Version, curriculum.Name, len(entries))
		for day := 1; day <= 30; day++ {
			count, effort := 0, 0
			for _, entry := range entries {
				if entry.Day == day {
					count++
					effort += entry.EstimatedMinutes
				}
			}
			fmt.Fprintf(out, "Day %02d: %d tasks, approximately %d minutes\n", day, count, effort)
		}
		fmt.Fprintln(out, "To import: DATABASE_URL=<your-database> go run ./cmd/curriculum --apply --admin-login <existing-platform-admin>")
		return nil
	}
	if strings.TrimSpace(*login) == "" {
		return errors.New("--admin-login is required with --apply; no users will be created or promoted")
	}
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		return errors.New("DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	pool, err := db.Open(ctx, url)
	if err != nil {
		return err
	}
	defer pool.Close()
	// Import expects the app's current schema; schema migrations belong to API startup.
	var result curriculum.ImportResult
	err = store.New(pool).Tx(ctx, func(q store.Q) error {
		var id uuid.UUID
		if err := q.QueryRow(ctx, "SELECT id FROM users WHERE lower(github_login) = lower($1) AND role = 'admin'", strings.TrimSpace(*login)).Scan(&id); err != nil {
			return errors.New("existing platform admin not found; no users were created or promoted")
		}
		var err error
		result, err = curriculum.Import(ctx, q, id, time.Now().UTC())
		return err
	})
	if err != nil {
		return err
	}
	status := "already present; preserved without changes"
	if result.Created {
		status = "created new published edition"
	}
	fmt.Fprintf(out, "%s: %s (%s), %d tasks. Existing assignments are unchanged.\n", status, curriculum.Name, result.FlowID, result.Tasks)
	return nil
}
