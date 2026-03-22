# ─────────────────────────────────────────────────────────────────
# PeerTutor Frontend — Multi-stage Dockerfile
# Stage 1: development (Vite HMR)
# Stage 2: builder    (vite build)
# Stage 3: production (nginx serves static assets)
# ─────────────────────────────────────────────────────────────────

# ── Stage 1: Development ─────────────────────────────────────────
FROM node:22-alpine AS development
WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ── Stage 2: Builder ─────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build args become VITE_ env vars at build time
ARG VITE_API_URL
ARG VITE_COGNITO_USER_POOL_ID
ARG VITE_COGNITO_CLIENT_ID
ARG VITE_AWS_REGION=us-east-1
ARG VITE_SENTRY_DSN
ARG VITE_RECAPTCHA_SITE_KEY

RUN npm run build

# ── Stage 3: Production ──────────────────────────────────────────
FROM nginx:1.25-alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing — all routes → index.html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
