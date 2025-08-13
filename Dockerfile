FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY OneBookR/backend/package*.json ./OneBookR/backend/
COPY OneBookR/calendar-frontend/package*.json ./OneBookR/calendar-frontend/

# Install dependencies
RUN cd OneBookR/backend && npm install
RUN cd OneBookR/calendar-frontend && npm install

# Copy source code
COPY . .

# Build frontend
RUN cd OneBookR/calendar-frontend && npm run build

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "OneBookR/backend/server.js"]