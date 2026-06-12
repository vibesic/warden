.PHONY: help tag release

# Variables
VERSION ?= 

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

tag: ## Create a new git tag (usage: make tag VERSION=v1.0.0)
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION is not set. Use format: make tag VERSION=v1.0.0"; \
		exit 1; \
	fi
	@if ! echo "$(VERSION)" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$$'; then \
		echo "Error: VERSION must be in semver format (e.g. v1.0.0)"; \
		exit 1; \
	fi
	git tag "$(VERSION)"
	@echo "Created tag $(VERSION)"

release: tag ## Create and push a new git tag to trigger the release workflow (usage: make release VERSION=v1.0.0)
	git push origin "$(VERSION)"
	@echo "Pushed tag $(VERSION) to origin."
	@echo "GitHub Actions will now build and publish to Docker Hub."
