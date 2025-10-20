FROM node:18

WORKDIR /app

# Copy all source code first
COPY . .

# Install root dependencies
RUN npm install

# Install backend dependencies
RUN cd OneBookR/backend && npm install

# Install frontend dependencies and build
RUN cd OneBookR/calendar-frontend && npm install && npm run build

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "OneBookR/backend/server.js"]