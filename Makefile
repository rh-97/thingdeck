# Every target runs inside Docker — nothing is installed on the host.
DC  := docker compose
RUN := $(DC) run --rm --no-deps app

.PHONY: help install dev stop test coverage lint typecheck format build check prod e2e screenshots shell clean

help: ## Show available targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies into the node_modules volume
	$(RUN) npm install

dev: ## Start the dev server on http://localhost:5180
	$(DC) up app

stop: ## Stop running containers
	$(DC) down

test: ## Run unit and component tests
	$(RUN) npm test

coverage: ## Run tests with coverage
	$(RUN) npm run coverage

lint: ## Lint the codebase
	$(RUN) npm run lint

typecheck: ## Type-check without emitting
	$(RUN) npm run typecheck

format: ## Format with Prettier
	$(RUN) npm run format

build: ## Production build into ./dist
	$(RUN) npm run build

check: ## Everything CI runs
	$(RUN) sh -c "npm run typecheck && npm run lint && npm test && npm run build"

prod: ## Build and serve the nginx image on http://localhost:8080
	$(DC) --profile prod up --build prod

e2e: ## Run Playwright smoke tests against the dev server (in a Playwright container)
	./scripts/e2e.sh

screenshots: ## Regenerate README screenshots (in a Playwright container)
	./scripts/e2e.sh screenshots

shell: ## Open a shell in the dev container
	$(RUN) bash

clean: ## Remove containers, images and the node_modules volume
	$(DC) --profile prod down --rmi local --volumes
