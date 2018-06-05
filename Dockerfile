FROM node:10

RUN mkdir /src

WORKDIR /src
ADD . /src
RUN yarn install

EXPOSE 3000

WORKDIR /src

CMD yarn start
