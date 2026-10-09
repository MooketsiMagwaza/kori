# Kori field: built and served by Next.js. The pattern (install from the lock file with a cache
# mount, build, run as the unprivileged node user, health check over HTTP) follows the owner's
# earlier web Dockerfiles; see PROVENANCE.md.
FROM node:25-alpine

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,id=kori-field-npm,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

COPY . .

RUN npm run build && chown -R node:node /app/.next

USER node

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3100/ || exit 1

CMD ["npx", "next", "start", "-p", "3100", "-H", "0.0.0.0"]
