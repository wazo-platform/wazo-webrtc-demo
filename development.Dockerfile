FROM node:15.11-alpine

RUN set -eux && \
    apk add python3 && \
    mkdir /demo

WORKDIR /demo

COPY package.json /demo
COPY yarn.lock /demo

RUN yarn install

COPY . /demo

CMD yarn start
