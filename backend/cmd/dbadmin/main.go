// Command dbadmin runs one-off maintenance against any database, production included:
//
//	dbadmin flush -mode demo|all -confirm FLUSH   remove the demo seed (or everything)
//	dbadmin admins -logins alice,bob              make GitHub users platform admins
//
// It needs only DATABASE_URL and applies pending migrations first.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/db"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

const usage = `usage:
  dbadmin flush -mode demo|all -confirm FLUSH
  dbadmin admins -logins alice,bob`

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "dbadmin:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New(usage)
	}
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		return errors.New("DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	var job func(store.Q) error
	switch args[0] {
	case "flush":
		fs := flag.NewFlagSet("flush", flag.ContinueOnError)
		mode := fs.String("mode", "demo", "demo (seeded accounts and catalog) or all (every row except programs)")
		confirm := fs.String("confirm", "", "must be FLUSH")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if *confirm != "FLUSH" {
			return errors.New("refusing to flush without -confirm FLUSH")
		}
		job = func(q store.Q) error {
			if err := seed.Flush(ctx, q, seed.FlushMode(*mode)); err != nil {
				return err
			}
			fmt.Printf("flushed (%s)\n", *mode)
			return nil
		}
	case "admins":
		fs := flag.NewFlagSet("admins", flag.ContinueOnError)
		logins := fs.String("logins", "", "comma-separated GitHub usernames")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		job = func(q store.Q) error {
			res, err := seed.SeedAdmins(ctx, q, strings.Split(*logins, ","), time.Now().UTC())
			if err != nil {
				return err
			}
			for _, r := range res {
				fmt.Printf("@%s: %s\n", r.Login, r.Status)
			}
			return nil
		}
	default:
		return errors.New(usage)
	}

	pool, err := db.Open(ctx, url)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}
	return store.New(pool).Tx(ctx, job)
}
