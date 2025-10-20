FROM node:20

ENV NODE_ENV=production

WORKDIR /app

# Install backend deps (cached)
COPY OneBookR/backend/package*.json OneBookR/backend/
RUN cd OneBookR/backend && npm ci

# Install frontend deps (cached)
COPY OneBookR/calendar-frontend/package*.json OneBookR/calendar-frontend/
RUN cd OneBookR/calendar-frontend && npm ci

# Copy the rest of the source
COPY . .

# Build frontend
RUN cd OneBookR/calendar-frontend && npm run build

# Prune backend dev dependencies to keep image slim
RUN cd OneBookR/backend && npm prune --omit=dev

# Railway will set PORT; server listens on PORT or 3000
EXPOSE 3000

CMD ["node", "OneBookR/backend/server.js"]