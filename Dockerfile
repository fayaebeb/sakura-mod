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

# ✅ Add the TypeScript build step
RUN npm run build  # This creates the dist/ folder

# Set the correct port for DigitalOcean
ENV PORT=8080
EXPOSE 8080

# Start the application (now using the built dist/)
CMD ["node", "dist/index.js"]
