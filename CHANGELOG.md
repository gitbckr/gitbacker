## [0.16.1](https://github.com/gitbckr/gitbacker/compare/v0.16.0...v0.16.1) (2026-04-17)


### Bug Fixes

* make alembic migrations idempotent ([128b5bf](https://github.com/gitbckr/gitbacker/commit/128b5bff69e2a4d62f8153c7073b5942148a564e))

# [0.16.0](https://github.com/gitbckr/gitbacker/compare/v0.15.2...v0.16.0) (2026-04-17)


### Features

* derive and display SSH public key, warn on git@ URLs, block encrypt without keys ([ec3f4dc](https://github.com/gitbckr/gitbacker/commit/ec3f4dc13e7dd197ed06b79eee9e1622e1712609))

## [0.15.2](https://github.com/gitbckr/gitbacker/compare/v0.15.1...v0.15.2) (2026-04-17)


### Bug Fixes

* add openssh-client and gnupg to Docker images ([a926928](https://github.com/gitbckr/gitbacker/commit/a926928de0939b7b20bf614c212717149822ebca))

## [0.15.1](https://github.com/gitbckr/gitbacker/compare/v0.15.0...v0.15.1) (2026-04-17)


### Bug Fixes

* hardcode Postgres/Redis data paths, only BACKUP_DIR is configurable ([8b68b2a](https://github.com/gitbckr/gitbacker/commit/8b68b2af5e91c70dbf2c6b83bcd12474be005a34))

# [0.15.0](https://github.com/gitbckr/gitbacker/compare/v0.14.1...v0.15.0) (2026-04-17)


### Bug Fixes

* set-default destination fails with unique constraint violation ([bd363be](https://github.com/gitbckr/gitbacker/commit/bd363be3c1f55b776e24fc19daedce764dc6b813))


### Features

* separate DB_DIR and BACKUP_DIR, constrain local destinations ([65e5e18](https://github.com/gitbckr/gitbacker/commit/65e5e183787d9a53ae726268672150540d1e57b0))

## [0.14.1](https://github.com/gitbckr/gitbacker/compare/v0.14.0...v0.14.1) (2026-04-17)


### Bug Fixes

* remove explicit enum creation from migration — causes duplicate error on Postgres ([cf74ab4](https://github.com/gitbckr/gitbacker/commit/cf74ab4ba1ef533b93788657653c5a51d6875386))

# [0.14.0](https://github.com/gitbckr/gitbacker/compare/v0.13.0...v0.14.0) (2026-04-17)


### Bug Fixes

* retry alembic migration on startup for Docker ordering resilience ([25d2ca9](https://github.com/gitbckr/gitbacker/commit/25d2ca93d7772a54126b0dc5e500712d1aaba1ad))
* update destination tests for path validation ([572e155](https://github.com/gitbckr/gitbacker/commit/572e155a9730416a2abe301233a29ed5fc89c23e))


### Features

* bind-mount volumes and auto-seed default backup destination ([30713c9](https://github.com/gitbckr/gitbacker/commit/30713c98991721c514e2c8b9e7568f2751fa11f1))
* restrict local destinations with path validation and default protection ([91fbabf](https://github.com/gitbckr/gitbacker/commit/91fbabf2275c7ebc1a3e32c8ca132fa4e11d7deb))

# [0.13.0](https://github.com/gitbckr/gitbacker/compare/v0.12.0...v0.13.0) (2026-04-16)


### Features

* add logo assets, dark/light theme toggle, and stale logo state ([4f452a0](https://github.com/gitbckr/gitbacker/commit/4f452a07a9a0ddd12256fbc1c042c4dd409b8837))

# [0.12.0](https://github.com/gitbckr/gitbacker/compare/v0.11.0...v0.12.0) (2026-04-16)


### Features

* add alembic migrations, replace create_all with upgrade on startup ([2f9487d](https://github.com/gitbckr/gitbacker/commit/2f9487d99c86ec5a0956bbe48a4f9fa3e7f151c1))

# [0.11.0](https://github.com/gitbckr/gitbacker/compare/v0.10.0...v0.11.0) (2026-04-16)


### Bug Fixes

* security hardening — credential scrubbing, path traversal, password validation ([d5f4253](https://github.com/gitbckr/gitbacker/commit/d5f42539e047570b0580d260c92832f5fcb5a136))


### Features

* add alembic migrations, replace create_all with upgrade on startup ([17009ba](https://github.com/gitbckr/gitbacker/commit/17009ba5f2d8c5f8456c471d3d5cf560efbc7f28))

# [0.10.0](https://github.com/gitbckr/gitbacker/compare/v0.9.0...v0.10.0) (2026-04-16)


### Features

* snapshot download and git subprocess hardening ([8c17bb3](https://github.com/gitbckr/gitbacker/commit/8c17bb353e594fb5a8c8c357bfcbf704a715b8bc))

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
