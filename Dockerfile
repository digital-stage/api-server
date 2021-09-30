FROM node
LABEL authors="Digital Stage"

# Update packages
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /api-server

# Install dependencies
COPY package*.json ./
COPY tsconfig.json ./
COPY *.crt ./
COPY src ./src
RUN npm ci --only=production
RUN npm install -g forever

# Build source
RUN npm run build

COPY . /api-server

EXPOSE 8080
ENTRYPOINT ["forever", "./dist/index.js"]