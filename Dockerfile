# Build stage: compile TypeScript and generate Prisma client
FROM node:20-alpine AS builder

WORKDIR /app

COPY prisma ./prisma/
COPY package.json package-lock.json* ./
# Install all deps (including dev) so we can build (postinstall runs prisma generate)
RUN npm ci
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Run stage: only production deps + dist
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install production deps only (avoids "Use --omit=dev" warning when using npm install --production)
COPY prisma ./prisma/
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 4000

# Plataformas em nuvem costumam definir PORT (ex.: 8080)
ENV PORT=4000
CMD ["node", "dist/index.js"]
