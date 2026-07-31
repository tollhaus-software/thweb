# Step 1: Build stage (pure static compilation, no environment variables needed)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# npm ci: Clean install of exact dependencies from package-lock.json for reproducible builds
RUN npm ci

COPY . .
# npm run build: Compile TypeScript and bundle static assets into the /dist directory
RUN npm run build

# Step 2: Runtime stage with Nginx
FROM nginx:alpine

# Copy built static SPA files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy Nginx configuration templates
COPY nginx-templates /etc/nginx/templates

# Copy runtime environment variable generator script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
# Run Nginx in the foreground so the Docker container stays active
CMD ["nginx", "-g", "daemon off;"]
