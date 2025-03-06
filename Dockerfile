# Use an official Node.js image with Debian-based system
FROM node:20-bullseye

# Install system dependencies (LibreOffice, Java, Poppler)
RUN apt-get update && apt-get install -y \
    libreoffice \
    libreoffice-writer \
    libreoffice-impress \
    libreoffice-common \
    poppler-utils \
    default-jre \
    curl && \
    rm -rf /var/lib/apt/lists/*

# Verify LibreOffice is installed
RUN libreoffice --version

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the port (adjust if needed)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
