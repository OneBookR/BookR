FROM node:20

WORKDIR /app

# Copy all source code first
COPY . .

# Install root dependencies (med retry)
RUN npm install || npm install

# Install backend dependencies (med retry)
RUN cd OneBookR/backend && npm install || npm install

# Install frontend dependencies and build (med retry)
RUN cd OneBookR/calendar-frontend && npm install || npm install && npm run build

EXPOSE 8080

CMD ["node", "OneBookR/backend/server.js"]