FROM node:15.11-alpine AS builder

RUN apk add python3 && \
    mkdir /demo
WORKDIR /demo

COPY package.json /demo
COPY yarn.lock /demo

RUN yarn install
COPY . /demo

CMD yarn start
