# This image is intended to run on Linux (amd64 in our cluster).
# Build with: docker buildx build --platform linux/amd64 ...
FROM --platform=$TARGETPLATFORM node:20-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build


FROM --platform=$TARGETPLATFORM nginx:1.27-alpine

# 避免 worker_processes auto 在超大节点上产生过多 worker（默认与 CPU 核数一致）
RUN sed -i.bak 's/^worker_processes.*/worker_processes 5;/' /etc/nginx/nginx.conf && rm -f /etc/nginx/nginx.conf.bak

RUN apk add --no-cache jq

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-trv-route-merge-ai-proxy.sh /docker-entrypoint.d/40-trv-route-merge-ai-proxy.sh
RUN chmod +x /docker-entrypoint.d/40-trv-route-merge-ai-proxy.sh \
  && mkdir -p /etc/nginx/snippets

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

