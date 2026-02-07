# Stage 1: Build
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS builder
ARG TARGETARCH
ARG VERSION=0.0.0-dev
WORKDIR /app
COPY . .
RUN dotnet restore src/DeltaBoard.Server/DeltaBoard.Server.csproj -r linux-musl-$TARGETARCH
RUN dotnet publish src/DeltaBoard.Server/DeltaBoard.Server.csproj \
    -c Release \
    -r linux-musl-$TARGETARCH \
    -o /app/publish \
    --self-contained true \
    /p:PublishSingleFile=true \
    /p:Version=$VERSION

# Stage 2: Runtime
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0-alpine
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
RUN apk add --no-cache icu-data-full icu-libs gcompat tzdata
WORKDIR /app
COPY --from=builder /app/publish .
EXPOSE 8080
ENTRYPOINT ["./DeltaBoard.Server"]
