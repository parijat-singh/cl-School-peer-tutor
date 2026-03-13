# ─────────────────────────────────────────────────────────────────
# PeerTutor Frontend — Multi-stage Dockerfile
# Stage 1: development (Vite HMR)
# Stage 2: builder    (vite build)
# Stage 3: production (nginx serves static assets)
# ─────────────────────────────────────────────────────────────────

# ── Stage 1: Development ─────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ── Stage 2: Builder ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build args become VITE_ env vars at build time
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_USE_EMULATORS=false

RUN npm run build

# ── Stage 3: Production ──────────────────────────────────────────
FROM nginx:1.25-alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing — all routes → index.html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
