FROM golang:alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build server binary
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Final lightweight runtime image
FROM alpine:latest

# Install ca-certificates so HTTPS requests (e.g. Google OAuth verification) work smoothly
RUN apk --no-cache add ca-certificates

# Create dedicated unprivileged app user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app
COPY --from=builder /app/server .
RUN chown -R appuser:appgroup /app

USER appuser:appgroup

EXPOSE 8080

CMD ["./server"]
