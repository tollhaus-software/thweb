# Step 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# npm ci: Clean install of exact dependencies from package-lock.json for reproducible builds
RUN npm ci

COPY . .
# Accept build argument for Vite environment variable
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# npm run build: Compile TypeScript and bundle static assets into the /dist directory
RUN npm run build

# Step 2: Runtime stage with Nginx
FROM nginx:alpine

# Copy built static SPA files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy Nginx configuration with API & WebSocket proxies
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Run Nginx in the foreground so the Docker container stays active
CMD ["nginx", "-g", "daemon off;"]
