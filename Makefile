# Everything runs in containers: nothing but Docker and make is needed on the host.
# SLOT isolates parallel environments (0 for a human, 1-3 for developer agents, 9 for review):
# each slot is its own Compose project, and its app listens on port 30{SLOT}0.
SLOT ?= 0
WIDTH ?= 360
export SLOT
export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)

COMPOSE := docker compose
RUN := $(COMPOSE) run --rm
NO_DEPS := $(RUN) --no-deps web

help: ## Shows this help
	@grep -hE '^[a-z0-9-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/' | expand -t16

node_modules: package.json package-lock.json
	$(NO_DEPS) npm ci
	@touch node_modules

install: node_modules ## Installs dependencies (in the container)

check: node_modules ## Everything the CI runs: lint, typecheck, i18n keys, tests
	$(RUN) web npm run check

up: node_modules ## Starts the slot's app and database, waits until the app answers
	$(COMPOSE) up -d --wait web
	@echo "http://localhost:30$(SLOT)0"

down: ## Stops the slot and deletes its data
	$(COMPOSE) --profile tools down --volumes --remove-orphans

migrate: node_modules ## Applies pending migrations to the slot's database
	$(RUN) web npm run db:migrate

e2e: up ## Runs the end-to-end tests against the slot's app
	$(RUN) e2e npx playwright test --project=e2e $(ARGS)

shot: up ## Takes screenshots at WIDTH px (default 360) into var/shots
	$(RUN) -e SHOT_WIDTH=$(WIDTH) e2e npx playwright test --project=shot

logs: ## Follows the slot's logs
	$(COMPOSE) logs -f

npm: ## Runs npm in the container, e.g. make npm ARGS="install zod"
	$(NO_DEPS) npm $(ARGS)

.PHONY: help install check up down migrate e2e shot logs npm
