FROM node:20-bullseye

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    libreoffice \
    poppler-utils \
    default-jre \
    fonts-dejavu \
    fonts-liberation \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

RUN libreoffice --version

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# ✅ Build everything
RUN npm run build

# ✅ Move client build to backend's expected location
RUN mkdir -p ./dist/public && \
    cp -r ./client/dist/* ./dist/public/

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "start"]
