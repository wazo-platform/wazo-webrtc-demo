FROM node:15.11-alpine AS builder
RUN set -eux && \
    apk add python3 && \
    mkdir /demo
WORKDIR /demo
COPY package.json /demo
COPY yarn.lock /demo
RUN yarn install --frozen-lockfile
COPY . /demo
CMD yarn build

FROM nginx:alpine
COPY --from=builder /demo/build /usr/share/nginx/html
EXPOSE 80
