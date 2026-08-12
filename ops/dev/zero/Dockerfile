FROM node:22.23.1-alpine3.23

RUN apk add --no-cache curl readline readline-dev
RUN corepack enable && corepack prepare pnpm@11.11.0 --activate

WORKDIR /opt/zero

# The build context is the pinned sibling Zero checkout, not a generated Codeline package.
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @rocicorp/zero... build

RUN mkdir -p /var/lib/zero && chown node:node /var/lib/zero

WORKDIR /opt/zero/packages/zero
ENV PATH="/opt/zero/node_modules/.bin:/opt/zero/packages/zero/node_modules/.bin:${PATH}"
ENV ZERO_IN_CONTAINER=1
ENV ZERO_LOG_FORMAT=json
USER node

EXPOSE 4848 4849
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["node out/zero/src/cli.js"]
