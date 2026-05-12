# This image is intended to run on Linux (amd64 in our cluster).
# Build with: docker buildx build --platform linux/amd64 ...
FROM --platform=$TARGETPLATFORM node:20-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build


FROM --platform=$TARGETPLATFORM nginx:1.27-alpine

RUN apk add --no-cache jq

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-trv-route-merge-ai-proxy.sh /docker-entrypoint.d/40-trv-route-merge-ai-proxy.sh
RUN chmod +x /docker-entrypoint.d/40-trv-route-merge-ai-proxy.sh \
  && mkdir -p /etc/nginx/snippets

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1

