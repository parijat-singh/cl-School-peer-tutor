# ─────────────────────────────────────────────────────────────────
# PeerTutor Backend — Firebase Emulators + Cloud Functions
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine

# Install Java (required by Firebase emulators)
RUN apk add --no-cache openjdk17-jre-headless

# Install Firebase CLI globally
RUN npm install -g firebase-tools@13

WORKDIR /app

# Copy project config files
COPY firebase.json .firebaserc ./
COPY firestore/firestore.rules   ./firestore/
COPY firestore/firestore.indexes.json ./firestore/
COPY storage/storage.rules       ./storage/

# Install Cloud Functions dependencies
WORKDIR /app/functions
COPY functions/package.json functions/package-lock.json ./
RUN npm ci

COPY functions/ .

# Build TypeScript
RUN npm run build

WORKDIR /app

EXPOSE 4000 5001 8080 9099 9199

CMD firebase emulators:start \
    --only auth,firestore,functions,storage \
    --project ${FIREBASE_PROJECT_ID:-peertutor-dev} \
    --export-on-exit=/app/.firebase-data \
    --import=/app/.firebase-data
