import express, { Express, Request, Response } from 'express';
import config from '../config';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import userController from './routers/user.router';
import { AuthMiddleware } from './middlewares/auth.middleware';
import { statusRouter } from './routers/status.router';
import { communicationHandlerRouter } from './routers/communicationHandler.router';
import { storageRouter } from './routers/storage.router';
import { legalPersonRouter } from './routers/legal_person.router';
import verifiersRouter from './routers/verifiers.router';
import { replacerBufferToTaggedBase64Url, reviverTaggedBase64UrlToBuffer } from './util/util';
import * as WebSocket from 'ws';
import http from 'http';
import { appContainer } from './services/inversify.config';
import { SocketManagerServiceInterface } from './services/interfaces';
import { TYPES } from './services/types';
import https from 'https';
import fs from 'fs';
import path from 'path';


const app: Express = express();
// __dirname is "/path/to/dist/src"

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ reviver: reviverTaggedBase64UrlToBuffer }));
app.set('json replacer', replacerBufferToTaggedBase64Url);

app.use(express.static('public'));
// __dirname is "/path/to/dist/src"
// public is located at "/path/to/dist/src"
app.use(cors({
	credentials: true,
	origin: true,
	allowedHeaders: ['Authorization', 'Content-Type', 'X-Private-Data-If-Match'],
	exposedHeaders: ['X-Private-Data-ETag'],
}));


// define routes and middleware here
app.use('/status', statusRouter);
app.use('/user', userController);



app.use(AuthMiddleware);

// all the following endpoints are guarded by the AuthMiddleware
app.use('/communication', communicationHandlerRouter);
app.use('/storage', storageRouter);
app.use('/legal_person', legalPersonRouter);
app.use('/verifiers', verifiersRouter);





const server = http.createServer(app);
appContainer.get<SocketManagerServiceInterface>(TYPES.SocketManagerService).register(server);

server.listen(config.port, () => {
	console.log(`Wallet Backend Server listening with ${config.url}`)
});
