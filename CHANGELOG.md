# [0.6.0](https://github.com/gitbckr/gitbacker/compare/v0.5.2...v0.6.0) (2026-04-12)


### Features

* add one-liner install script and landing page for gitbacker.com ([00e6b20](https://github.com/gitbckr/gitbacker/commit/00e6b200641a8434d3540405de5d0f43252e48b6))

# Changelog

## [0.5.0](https://github.com/gitbckr/gitbacker/releases/tag/v0.5.0) (2026-04-12)

### Features

* **restore:** backup snapshot recording and repository restore via force-mirror push
* **credentials:** git credential management (PAT + SSH key) with per-host matching
* **notifications:** Slack webhook alerts for backup/restore failures, verification failures, disk space
* **settings:** restructured settings UI with sidebar navigation (General, Git Credentials, Notifications, Encryption, Users)
* **repos:** edit dialog for destination, schedule, and encryption
* **docker:** multi-stage Dockerfiles for api, worker, and frontend
* **ci:** GitHub Actions pipeline with semantic-release
* **compose:** production docker-compose.yml for self-hosting
* **frontend:** relative /api paths with Next.js server-side rewrites

### Bug Fixes

* passive_deletes on CASCADE relationships (repo deletion)
* global_settings schema drift (missing columns)
* git commands no longer hang on credential prompts (GIT_TERMINAL_PROMPT=0)
