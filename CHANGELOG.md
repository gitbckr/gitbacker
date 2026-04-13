# [0.9.0](https://github.com/gitbckr/gitbacker/compare/v0.8.0...v0.9.0) (2026-04-13)


### Features

* restore preview with file diffs, skip-unchanged backups, and logging cleanup ([484b52a](https://github.com/gitbckr/gitbacker/commit/484b52a18b339be7092ac4364226b7ef0c575b54))

# [0.8.0](https://github.com/gitbckr/gitbacker/compare/v0.7.2...v0.8.0) (2026-04-13)


### Features

* encrypt secrets at rest, restore jobs list, and user safety guards ([b410db4](https://github.com/gitbckr/gitbacker/commit/b410db4c16e0128e05ee13f763b1989d74811b95))
* timezone-aware scheduling, batch operations, and UI improvements ([efd4067](https://github.com/gitbckr/gitbacker/commit/efd40678d47532925bbf31f94c9c8748132e8c41))

## [0.7.2](https://github.com/gitbckr/gitbacker/compare/v0.7.1...v0.7.2) (2026-04-13)


### Bug Fixes

* seed admin password handling and Docker frontend proxy ([4969fbc](https://github.com/gitbckr/gitbacker/commit/4969fbc44f3a88642cc9ac527cb9d0b9438543ea))

## [0.7.1](https://github.com/gitbckr/gitbacker/compare/v0.7.0...v0.7.1) (2026-04-13)


### Bug Fixes

* require ADMIN_PASSWORD and update on reinstall ([2167693](https://github.com/gitbckr/gitbacker/commit/216769306e80cbdcc7906cb62d637c0a086b6eee))

# [0.7.0](https://github.com/gitbckr/gitbacker/compare/v0.6.2...v0.7.0) (2026-04-12)


### Features

* interactive dashboard with storage overview and version display ([d105a0c](https://github.com/gitbckr/gitbacker/commit/d105a0cd65711c5583e64a69d9348b80d3e7b7e0))

## [0.6.2](https://github.com/gitbckr/gitbacker/compare/v0.6.1...v0.6.2) (2026-04-12)


### Bug Fixes

* remove tracked celerybeat-schedule.db and fix gitignore pattern ([c5fc393](https://github.com/gitbckr/gitbacker/commit/c5fc39303ea7853f5235f5d4ea2249d7af2f7dbf))

## [0.6.1](https://github.com/gitbckr/gitbacker/compare/v0.6.0...v0.6.1) (2026-04-12)


### Bug Fixes

* install script stdin handling for curl-pipe-bash and iTerm ([f37c963](https://github.com/gitbckr/gitbacker/commit/f37c963e88653cce3bfdeaa3df5b8772b0e74f16))

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
