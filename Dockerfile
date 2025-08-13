FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY OneBookR/backend/package*.json ./OneBookR/backend/

# Install dependencies
RUN cd OneBookR/backend && npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "OneBookR/backend/server.js"]