# Garage Web UI

[![image](misc/img/garage-webui.png)](misc/img/garage-webui.png)

A simple admin web UI for [Garage](https://garagehq.deuxfleurs.fr/), a self-hosted, S3-compatible, distributed object storage service.

[ [Screenshots](misc/SCREENSHOTS.md) | [Install Garage](https://garagehq.deuxfleurs.fr/documentation/quick-start/) | [Garage Git](https://git.deuxfleurs.fr/Deuxfleurs/garage) ]

## Features

- Garage health status
- Cluster & layout management
- Create, update, or view bucket information
- Integrated objects/bucket browser
- Create & assign access keys

## Garage compatibility

The UI supports Garage 2.4.1 and 2.5.0. See [misc/GARAGE-COMPATIBILITY.md](misc/GARAGE-COMPATIBILITY.md) for the matrix and the decision on unused admin routes.

## Installation

The Garage Web UI is available as a single executable binary and docker image. You can install it using the command line or with Docker Compose.

### Docker CLI

```sh
$ docker run -p 3909:3909 \
    -v ./garage.toml:/etc/garage.toml:ro \
    -e AUTH_USER_PASS='username:YOUR_BCRYPT_HASH' \
    --restart unless-stopped --name garage-webui \
    ghcr.io/suorcd/garage-webui:latest
```

The container runs as UID 10001. Make `garage.toml` readable by that user, for example `chmod 644 garage.toml`.

A plain HTTP container adds `-e SESSION_COOKIE_SECURE=false` to that command. With Compose, set it in `.env`; `docker-compose.yml` forwards it.

The container does not start without `AUTH_USER_PASS`. See [Authentication](#authentication).

CI publishes the fork image to `ghcr.io/suorcd/garage-webui` only for version tags.

### Docker Compose

If you install Garage using Docker, you can install this web UI alongside Garage as follows:

```yml
services:
  garage:
    image: dxflrs/garage:v2.5.0
    container_name: garage
    volumes:
      - ./garage.toml:/etc/garage.toml
      - ./meta:/var/lib/garage/meta
      - ./data:/var/lib/garage/data
    restart: unless-stopped
    ports:
      - 3900:3900
      - 3901:3901
      - 3902:3902
      - 3903:3903

  webui:
    image: ghcr.io/suorcd/garage-webui:latest
    container_name: garage-webui
    restart: unless-stopped
    depends_on:
      - garage
    volumes:
      - ./garage.toml:/etc/garage.toml:ro
    ports:
      - 3909:3909
    environment:
      API_BASE_URL: "http://garage:3903"
      S3_ENDPOINT_URL: "http://garage:3900"
      AUTH_USER_PASS: "username:CHANGE_ME"
```

The web UI container runs as UID 10001. Make `garage.toml` readable by that user.

### Without Docker

The [release page](https://github.com/suorcd/garage-webui/releases/latest) has no binary asset yet. Until one exists, build it with `misc/build-binaries.sh` and copy the binary for your architecture to `/usr/local/bin`.

Run the program with specified `garage.toml` config path.

```sh
$ CONFIG_PATH=./garage.toml garage-webui
```

If you want to run the program at startup, you may want to create a systemd service.

```sh
$ sudo nano /etc/systemd/system/garage-webui.service
```

```
[Unit]
Description=Garage Web UI
After=network.target

[Service]
Environment="PORT=3919"
Environment="CONFIG_PATH=/etc/garage.toml"
ExecStart=/usr/local/bin/garage-webui
Restart=always

[Install]
WantedBy=default.target
```

Then reload and start the garage-webui service.

```sh
$ sudo systemctl daemon-reload
$ sudo systemctl enable --now garage-webui
```

### Nix

A Nix flake is included for reproducible builds and development. It builds the
UI with pnpm, embeds it into the Go backend, and produces a single
`garage-webui` binary.

```sh
$ nix build
$ CONFIG_PATH=./garage.toml ./result/bin/garage-webui
```

You can also build and run it in one step:

```sh
$ CONFIG_PATH=./garage.toml nix run
```

The flake exposes `packages.default`, `packages.garage-webui`, and a
`devShells.default` with Go, Node.js, pnpm, Air, and Garage for local
development. Use `nix run .#clean` to remove build output and local
development state (add `-- --deps` to remove `node_modules` as well).

The flake supports `x86_64-linux` and `aarch64-linux`. The development shell
includes Garage. Garage is not available on Darwin in nixpkgs, so the flake
does not expose a Darwin development shell.

Add new files to Git before `nix build`. The flake source contains tracked
files only.

### Configuration

To simplify installation, the Garage Web UI uses values from the Garage configuration, such as `rpc_public_addr`, `admin.admin_token`, `s3_web.root_domain`, etc. The browser receives only the `s3_web` bind address and root domain from `GET /config`. The admin token stays in the backend.

Example content of `config.toml`:

```toml
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
metadata_auto_snapshot_interval = "6h"

replication_factor = 3
compression_level = 2

rpc_bind_addr = "[::]:3901"
rpc_public_addr = "localhost:3901" # Required
rpc_secret = "YOUR_RPC_SECRET_HERE"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.domain.com"

[s3_web] # Optional, if you want to expose bucket as web
bind_addr = "[::]:3902"
root_domain = ".web.domain.com"
index = "index.html"

[admin] # Required
api_bind_addr = "[::]:3903"
admin_token = "YOUR_ADMIN_TOKEN_HERE"
metrics_token = "YOUR_METRICS_TOKEN_HERE"
```

However, if it fails to load, you can set `API_BASE_URL` & `API_ADMIN_KEY` environment variables instead.

### Environment Variables

Configurable envs:

- `CONFIG_PATH`: Path to the Garage `config.toml` file. Defaults to `/etc/garage.toml`.
- `BASE_PATH`: Base path or prefix for the Web UI. Empty by default. Set `VITE_BASE_PATH` to the same value when you build the frontend.
- `HOST`: Bind address for the web server. Defaults to `0.0.0.0`.
- `PORT`: Port for the web server. Defaults to `3909`.
- `API_BASE_URL`: Garage admin API endpoint URL. Without this value, the server derives the endpoint from `garage.toml`.
- `API_ADMIN_KEY`: Admin API key. Without this value, the server uses the `admin_token` from `garage.toml`.
- `S3_REGION`: S3 Region. Without this value, the server uses the `s3_region` from `garage.toml`, or `garage` when the file has none.
- `S3_ENDPOINT_URL`: S3 Endpoint URL. Without this value, the server derives the endpoint from `garage.toml`.
- `MAX_UPLOAD_SIZE`: Maximum upload size in bytes. Defaults to 5368709120 (5 GiB). The backend streams the upload to S3 and does not use a temporary file.
- `MAX_THUMBNAIL_SIZE`: Maximum image size in bytes for thumbnail generation. Defaults to 5242880 (5 MiB). Larger images show a placeholder.
- `AUTH_USER_PASS`: The login in `username:password_hash` format. The server refuses to start when this value is empty, unless `AUTH_DISABLED=true`.
- `AUTH_READONLY_USER_PASS`: An optional read-only login in `username:password_hash` format. It can call GET endpoints only. Use a username that differs from `AUTH_USER_PASS`.
- `AUTH_DISABLED`: Set to `true` to disable authentication for local development. The server logs a warning. Do not use this value in production.
- `TRUSTED_PROXIES`: IPs and CIDRs of trusted proxies, comma separated. Only these proxies may set `X-Forwarded-For` and `X-Real-IP`. Empty means no proxy is trusted.
- `SESSION_COOKIE_SECURE`: Set to `false` for a plain HTTP install. Defaults to `true`. A browser drops a Secure cookie over plain HTTP, and login never sticks.

Set `VITE_BASE_PATH` to the same value as `BASE_PATH` when you build the frontend. The build bakes the asset paths, and the server does not rewrite them. The Dockerfile accepts `VITE_BASE_PATH` as a build argument.

The server uses a 10 second `ReadHeaderTimeout` and a 120 second `IdleTimeout`. It sets no `WriteTimeout`, so streaming downloads and ZIP responses can run long. Do not add a `WriteTimeout`. It would cut off slow downloads.

Each Garage admin API call has a 30 second timeout. Mutating calls use a 3 minute timeout, so a slow key change does not fail while Garage still applies it.

### Authentication

Authentication is required. Set the `AUTH_USER_PASS` environment variable in the format `username:password_hash`, where `password_hash` is a bcrypt hash of the password.

A read-only login is optional. Set `AUTH_READONLY_USER_PASS` in the same format. A read-only user can call GET endpoints. The server rejects a state-changing request from that user with 403. Use a username that differs from `AUTH_USER_PASS`.

The server writes one JSON audit line for each state-changing API request. The line holds the user, method, path, status, and time. The server writes the line to standard output.

Generate the username and password hash using the following command:

```bash
htpasswd -nbBC 10 "YOUR_USERNAME" "YOUR_PASSWORD"
```

> If command 'htpasswd' is not found, install `apache2-utils` using your package manager.

Then update your `docker-compose.yml`:

```yml
webui:
  ....
  environment:
    AUTH_USER_PASS: "username:CHANGE_ME"
```

The server refuses to start when `AUTH_USER_PASS` is empty. For local development only, set `AUTH_DISABLED=true` to disable authentication. The server logs a warning in this mode.

The API requires the `X-Requested-With: XMLHttpRequest` header on every `POST`, `PUT`, `PATCH`, and `DELETE` request. The web UI sends this header. A script that calls the API must send it too. This header is the CSRF control.

### Running

Once your instance of Garage Web UI is started, you can open the web UI at http://your-ip:3909. You can place it behind a reverse proxy to secure it with SSL. A plain HTTP install must set `SESSION_COOKIE_SECURE=false`, or the browser drops the session cookie and login never sticks. In a container, pass it as an environment variable (`-e` for `docker run`, `.env` for Compose); the image has no `.env` of its own.

## Development

This project is bootstrapped using TypeScript & React for the UI, and Go for the backend. The easiest setup is the Nix flake, which provides the Go, Node.js, pnpm, Air, and Garage toolchain.

### Nix development environment

```sh
$ nix develop
$ pnpm install
$ dev
```

`dev` starts a single-node Garage instance on ports 3900 (S3), 3901 (RPC), 3902 (website), and 3903 (admin API), provisions the `garage-webui` bucket alias and `dev-key` access key, and then runs the Go API with live reload on port 3909 and Vite on port 5173. The `dev` script disables authentication. Do not expose the development server to an untrusted network.

The local Garage data lives in `.dev/garage`. To stop it and remove all local development state, run:

```sh
$ nix run .#clean           # add -- --deps to also remove node_modules
# or, inside nix develop:
$ clean
```

Its development credentials are:

- Admin token: `dev-admin-token`
- Bucket alias: `garage-webui`
- Key name: `dev-key` (run `scripts/garage-setup.sh --show-credentials` to print its ID and secret)

To run the pieces separately, use:

```sh
$ scripts/garage-dev.sh      # run Garage in the foreground
$ scripts/garage-setup.sh    # provision layout, key and bucket
$ pnpm run dev:client        # Vite
$ pnpm run dev:server        # Go API with Air
```

When starting the pieces manually, export `CONFIG_PATH=./dev/garage.toml` and the `API_BASE_URL`, `API_ADMIN_KEY`, and `S3_ENDPOINT_URL` values shown above.

### Manual setup

Without Nix, install Node.js, pnpm, Go, Air, and Garage yourself:

```sh
$ git clone https://github.com/suorcd/garage-webui.git
$ cd garage-webui && pnpm install
```

Run the frontend tests with `pnpm test`.

### Running

Start both the client and server concurrently:

```sh
$ pnpm run dev # or npm run dev
```

Or start each instance separately, from the repository root:

```sh
$ pnpm run dev:client
$ pnpm run dev:server
```

## Troubleshooting

Make sure you are using the latest version of Garage. If the data cannot be loaded, please check whether your instance of Garage has the admin API enabled and the ports are accessible.

If you encounter any problems, please do not hesitate to submit an issue [here](https://github.com/suorcd/garage-webui/issues). You can describe the problem and attach the error logs.
