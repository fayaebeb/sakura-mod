# Use Node.js base image with Debian
FROM node:20-bullseye

# Set environment variables to prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# ✅ Install system dependencies (LibreOffice, Java, Poppler, etc.)
RUN apt-get update && apt-get install -y \
    libreoffice \
    poppler-utils \
    default-jre \
    fonts-dejavu \
    fonts-liberation \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

# ✅ Verify LibreOffice installation
RUN libreoffice --version

# ✅ Set working directory
WORKDIR /app

# ✅ Copy package.json and package-lock.json, then install dependencies
COPY package.json package-lock.json ./
RUN npm install

# ✅ Copy the rest of the application
COPY . .

# ✅ Build everything (frontend + backend)
RUN npm run build

# ✅ Expose port 8080 (same as Render)
ENV PORT=8080
EXPOSE 8080

# ✅ Start the app
CMD ["npm", "run", "start"]
