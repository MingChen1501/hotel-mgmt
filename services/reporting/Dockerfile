# syntax=docker/dockerfile:1

# Build stage: static binary, no CGO.
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . ./
RUN CGO_ENABLED=0 go build -trimpath -o /server ./cmd/server

# Runtime stage: minimal static image, runs as nonroot.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /server /server
EXPOSE 8083
ENV PORT=8083
ENTRYPOINT ["/server"]
