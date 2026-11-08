.PHONY: build run test vet

build:
	CGO_ENABLED=0 go build -o main -tags="prod" main.go

# Run serves no UI. Vite serves the UI on port 5173.
run:
	go run main.go

test:
	go test ./...

vet:
	go vet ./...
