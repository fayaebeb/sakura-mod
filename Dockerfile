# Use Node.js with Debian-based system
FROM node:20-bullseye

# Set environment variables to prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies (LibreOffice, Java, Poppler-utils)
RUN apt-get update && apt-get install -y \
    libreoffice \
    poppler-utils \
    default-jre \
    fonts-dejavu \
    fonts-liberation \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

# Verify LibreOffice is installed
RUN libreoffice --version

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# ✅ Build the frontend (Vite)
WORKDIR /app/client  # Switch to frontend directory
RUN npm install
RUN npm run build  # Generates "client/dist/"

# ✅ Build the backend (TypeScript)
WORKDIR /app/server  # Switch to backend directory
RUN npm install
RUN npm run build  # Generates "server/dist/"

# ✅ Move built frontend to backend "public" (for serving via Express)
RUN mkdir -p /app/server/public
RUN cp -r /app/client/dist/* /app/server/public/

# Set the correct port for DigitalOcean
ENV PORT=8080
EXPOSE 8080

# ✅ Start the backend server (Express)
CMD ["node", "server/dist/index.js"]
