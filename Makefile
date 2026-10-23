# Common tasks. Requires Go 1.27, Node 24 LTS + pnpm 10, Flutter 3.47, Docker.
DB_URL ?= postgres://stackstep:stackstep@localhost:5432/stackstep?sslmode=disable
TEST_DB_URL ?= postgres://stackstep:stackstep@localhost:5432/stackstep_test?sslmode=disable

.PHONY: up down db api seed web mobile check check-backend check-web check-mobile contract e2e

up:            ## Whole stack in Docker
	docker compose up --build

down:
	docker compose down

db:            ## Just Postgres (for running api/web on the host)
	docker compose up -d db
	-docker compose exec -T db psql -U stackstep -c "CREATE DATABASE stackstep_test" 2>/dev/null

# backend/.env (optional, see backend/.env.example) is loaded first; its DATABASE_URL wins.
LOAD_ENV = set -a; [ -f .env ] && . ./.env; set +a;

seed:
	cd backend && export DATABASE_URL="$(DB_URL)"; $(LOAD_ENV) go run ./cmd/seed -reset

api:
	cd backend && export DATABASE_URL="$(DB_URL)" LEAD_REPLY_DELAY=5s; $(LOAD_ENV) go run ./cmd/api

web:
	cd web && pnpm dev

mobile:
	cd mobile && flutter run --dart-define=API_BASE_URL=http://localhost:8080

check: contract check-backend check-web check-mobile

check-backend:
	cd backend && golangci-lint run ./... && TEST_DATABASE_URL="$(TEST_DB_URL)" go test -race ./...

check-web:
	cd web && pnpm check

check-mobile:
	cd mobile && flutter analyze && flutter test

contract:
	npx -y @redocly/cli@2.69.0 lint
	npx -y @redocly/cli@2.69.0 bundle api/openapi.yaml --ext json -o .openapi.bundle.json
	node scripts/check-contract.mjs .openapi.bundle.json && rm -f .openapi.bundle.json

e2e:           ## Needs api (AUTH_RATE_PER_MINUTE=1000) and web (pnpm build && pnpm start) running
	cd e2e && SEED_CMD="sh -c 'cd ../backend && DATABASE_URL=$(DB_URL) go run ./cmd/seed -reset'" pnpm test
