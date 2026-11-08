FROM node:22-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS frontend
WORKDIR /app

RUN npm install -g corepack@latest && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM golang:1.26@sha256:cfa27959837144bf4649802ba38e59daffd0dd2a7994aa83daaf113285b0f551 AS backend
WORKDIR /app

# Create the non-root user for the final image.
RUN groupadd -g 10001 garage-webui && \
    useradd -u 10001 -g garage-webui -s /usr/sbin/nologin -M garage-webui

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
COPY --from=frontend /app/dist ./ui/dist
RUN make

FROM scratch

COPY --from=alpine:3.24@sha256:3f4d6b32e26703c6082839234f43769d5046b3ac7c910033911d1e71d8cd630a /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=ghcr.io/tarampampam/curl:8.6.0 /bin/curl /bin/curl
COPY --from=backend /app/main /bin/main
COPY --from=backend /etc/passwd /etc/passwd
COPY --from=backend /etc/group /etc/group

HEALTHCHECK --interval=5m --timeout=2s --retries=3 --start-period=15s CMD [ \
    "curl", "--fail", "http://127.0.0.1:3909" \
]

USER 10001:10001

ENTRYPOINT [ "main" ]
