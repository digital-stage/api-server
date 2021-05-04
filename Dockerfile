FROM node:14.15.0-buster AS build

ENV API_KEY=242420wj220f29f2f2!3f23f
ENV MONGO_URL=mongodb://mongo:27017
ENV MONGO_DB=api
ENV PORT=4000

COPY package.json ./
COPY tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:14.15.0-buster
ENV NODE_ENV=production
COPY package.json ./
RUN npm install
COPY --from=build /dist ./dist
EXPOSE 5000
ENTRYPOINT ["node", "./dist/index.js"]