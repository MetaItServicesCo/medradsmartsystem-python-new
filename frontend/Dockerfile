FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=https://medcodesolution.com/api/v1
ARG VITE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
ARG VITE_TURN_URLS
ARG VITE_TURN_USERNAME
ARG VITE_TURN_CREDENTIAL

ENV VITE_API_URL=$VITE_API_URL \
    VITE_STUN_URLS=$VITE_STUN_URLS \
    VITE_TURN_URLS=$VITE_TURN_URLS \
    VITE_TURN_USERNAME=$VITE_TURN_USERNAME \
    VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000
