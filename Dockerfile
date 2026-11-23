FROM golang:1.27.4-alpine AS build
WORKDIR /src
COPY container/main.go .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /desk main.go
FROM scratch
COPY --from=build /desk /desk
COPY dist/ /www/
COPY licenses/Go.txt /licenses/Go.txt
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/desk"]
