# Use an official Node.js image with Debian (supports apt-get)
FROM node:20-bullseye

# Install system dependencies (LibreOffice, Java, poppler-utils)
RUN apt-get update && apt-get install -y \
    libreoffice \
    default-jre \
    poppler-utils \
    curl && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the port (adjust if needed)
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
