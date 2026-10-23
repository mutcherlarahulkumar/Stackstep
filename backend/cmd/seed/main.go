// Command seed loads demo data. With -reset it first wipes workspace tables (refused in production).
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"
	_ "time/tzdata" // seed dates use the students' time zone, even in minimal images

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/config"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/db"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/store"
)

func main() {
	reset := flag.Bool("reset", false, "wipe workspace tables before seeding")
	flag.Parse()
	if err := run(*reset); err != nil {
		fmt.Fprintln(os.Stderr, "seed:", err)
		os.Exit(1)
	}
	fmt.Println("seed: done")
}

func run(reset bool) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if cfg.Env == config.EnvProduction {
		return errors.New("refusing to seed a production environment")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}
	return store.New(pool).Tx(ctx, func(q store.Q) error {
		if reset {
			if err := seed.Reset(ctx, q); err != nil {
				return err
			}
		}
		return seed.Run(ctx, q, time.Now().UTC())
	})
}
