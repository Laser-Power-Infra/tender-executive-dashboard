ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS stage1

WORKDIR /app

# ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
        npm i --no-audit --no-fund; \
    else \ 
        echo "no lock file" && exit 1; \
    fi

# stage 2
FROM node:${NODE_VERSION} AS stage2

WORKDIR /app

COPY --from=stage1 /app/node_modules ./node_modules 
COPY --from=stage1 /app/prisma ./prisma

COPY . .

RUN if [ -f package-lock.json ]; then \
        npm run build; \
    else \
        echo "build failed" && exit 1; \
    fi



# stage 3
FROM node:${NODE_VERSION} AS stage3

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=stage2 --chown=node:node /app/public ./public

RUN mkdir .next
RUN chown node:node .next

COPY --from=stage2 --chown=node:node /app/.next/standalone ./
COPY --from=stage2 --chown=node:node /app/.next/static ./.next/static


USER node 

EXPOSE 3000

CMD ["node", "server.js"]