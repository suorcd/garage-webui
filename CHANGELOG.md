# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is the first changelog entry for the fork. The previous release is v1.1.0.

## [Unreleased]

## [1.2.0] - 2026-11-09

### Added

- Manage bucket CORS rules from the bucket overview. (#169)
- Manage bucket lifecycle rules for expiration and abort-incomplete-multipart-upload. (#170)
- Create presigned download links with a 1 hour, 24 hour, or 7 day expiry. (#171)
- Sign presigned links against `S3_PUBLIC_ENDPOINT_URL` for container deployments. (#190)
- Upload a folder and keep its relative path in each object key. (#168)
- Set the key-level `createBucket` permission on create, import, and existing keys. (#165)
- Add an optional read-only viewer login with `AUTH_READONLY_USER_PASS`. (#172)
- Hide or disable mutation controls for a read-only viewer. (#193)
- Write a JSON audit line for each state-changing API request. (#166)
- Add frontend coverage reporting with `pnpm test:coverage`. (#167)
- Add object browser pagination with `nextToken`. (#131)
- Read key permissions on Garage 2.4 through `GetKeyInfo`. (#173, #188)

### Changed

- Align frontend response types with Garage and backend shapes. (#159)
- Set query defaults, request deadlines, retry rules, and health and status refresh intervals. (#138, #151)
- Serve embedded UI assets with 404 for missing files, immutable cache headers, and build-time base paths. (#160)
- Normalize `BASE_PATH` and set the Vite base path. (#120, #130)
- Improve API error parsing and parameter serialization. (#122)
- Aggregate multi-file uploads into one summary toast and one list refresh. (#137)
- Show key expiry in UTC and hide a viewed secret again on request. (#136, #154)
- Make list search case-insensitive. (#125)
- Add page loading, error, and empty states, a 404 page, and an error boundary. (#140)
- Return to the prior page after login and disable the login button while pending. (#144)
- Reset dialog state on close and on success. (#135)
- Confirm destructive autosave toggles and invalidate bucket data after autosave. (#141)
- Encode browse URL segments and follow browser Back and Forward. (#143, #127)
- Key the browse page chain on the mount token. (#152)
- Add Makefile `test` and `vet` targets and fix the fresh-clone build. (#124)
- Replace the archived `nfnt/resize` package with `golang.org/x/image/draw`. (#123)
- Parse IPv6 addresses in config-derived admin and S3 endpoints. (#118)
- Update the Docker, Compose, README, screenshot, and repository documentation. (#116, #117, #192)

### Fixed

- Bound the `/api` proxy with a 30 second response header timeout and return 504 on a timeout. (#157)
- Fold the response body read into the request deadline and stop retrying a 408. (#151)
- Do not report an empty keys page when the keys list fails. (#150)
- Hide zero bucket counts when `GetBucketInfo` fails. (#162)
- Show a 429 lockout countdown from `Retry-After`. (#163)
- Clear cached S3 credentials when a bucket alias or bucket changes. (#189)
- Gate CORS and lifecycle queries on bucket read access and disable writes without a write key. (#186)
- Reject unknown CORS fields and invalid lifecycle rules with 400. (#187)
- Show the folder upload spinner on the folder upload button. (#185)
- Allow read-only viewers to create presigned links. (#184)
- Fix the Create Buckets toggle on Garage 2.4 and disable only the active row. (#188)
- Remove dead cache code and use comma-ok type assertions. (#164)
- Fix the share dialog domain list and folder Share state. (#133)
- Fix the `Button` target prop and external link `rel` attributes. (#139)
- Validate quotas and bucket names on the client. (#126)
- Use `Promise.allSettled` for multi-key grants and report each key. (#132)
- Span the keys loading and empty rows across every column. (#142)
- Accept folder names with an equal sign. (#161)
- Fix the MainLayout navigation and the connect-node dialog. (#129, #134)
- Fix the permissions table keys, disabled checkboxes, and empty state. (#128)
- Add TabView fallback and keyboard support. (#121)
- Fix the frontend cleanup, dialog disclosure, and Chips behavior. (#153)
- Fix the accessibility labels, theme switcher, toasts, and theme flash. (#156)
- Reset the presigned link expiry when the share dialog closes. (#184)

### Security

- Remove `SecretAccessKey` from browser-facing bucket key types and hide config secrets from JSON. (#158)
- Reject state-changing requests from a read-only viewer with 403. (#172, #193)

[Unreleased]: https://github.com/suorcd/garage-webui/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/suorcd/garage-webui/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/suorcd/garage-webui/releases/tag/v1.1.0
