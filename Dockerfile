FROM node:22-alpine AS builder

WORKDIR /app

ARG BUILD=oss
ARG DATABASE=sqlite

# COPY package.json package-lock.json ./
COPY package*.json ./
RUN npm ci

COPY . .

RUN echo "export * from \"./$DATABASE\";" > server/db/index.ts

RUN echo "export const build = \"$BUILD\" as any;" > server/build.ts

# Copy the appropriate TypeScript configuration based on build type
RUN if [ "$BUILD" = "oss" ]; then cp tsconfig.oss.json tsconfig.json; \
    elif [ "$BUILD" = "saas" ]; then cp tsconfig.saas.json tsconfig.json; \
    elif [ "$BUILD" = "enterprise" ]; then cp tsconfig.enterprise.json tsconfig.json; \
    fi

# if the build is oss then remove the server/private directory
RUN if [ "$BUILD" = "oss" ]; then rm -rf server/private; fi

RUN if [ "$DATABASE" = "pg" ]; then npx drizzle-kit generate --dialect postgresql --schema ./server/db/pg/schema --out init; else npx drizzle-kit generate --dialect $DATABASE --schema ./server/db/$DATABASE/schema --out init; fi

RUN mkdir -p dist
RUN npm run next:build
RUN node esbuild.mjs -e server/index.ts -o dist/server.mjs -b $BUILD
RUN if [ "$DATABASE" = "pg" ]; then \
        node esbuild.mjs -e server/setup/migrationsPg.ts -o dist/migrations.mjs; \
    else \
        node esbuild.mjs -e server/setup/migrationsSqlite.ts -o dist/migrations.mjs; \
    fi

# test to make sure the build output is there and error if not
RUN test -f dist/server.mjs

RUN npm run build:cli

FROM node:22-alpine AS runner

WORKDIR /app

# Curl used for the health checks
RUN apk add --no-cache curl tzdata

# COPY package.json package-lock.json ./
COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/init ./dist/init

COPY ./cli/wrapper.sh /usr/local/bin/pangctl
RUN chmod +x /usr/local/bin/pangctl ./dist/cli.mjs

COPY server/db/names.json ./dist/names.json
COPY public ./public

CMD ["npm", "run", "start"]
