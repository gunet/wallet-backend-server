import { injectable } from "inversify";
import { ExpectingSocketMessageErr, SocketManagerServiceInterface } from "./interfaces";
import { Application } from "express";
import * as WebSocket from 'ws';
import http from 'http';
import { Err, Ok, Result } from "ts-results";
import { ServerSocketMessage, ClientSocketMessage, SignatureAction } from "./shared.types";
import { jwtVerify } from "jose";
import config from "../../config";

const openSockets = new Map<string, WebSocket.WebSocket>();

const secret = new TextEncoder().encode(config.appSecret);

@injectable()
export class SocketManagerService implements SocketManagerServiceInterface {
	wss: WebSocket.Server;

	constructor() { }

	register(server: http.Server) {
		this.wss = new WebSocket.Server({ server });

		this.wss.on('connection', (ws) => {
			console.log('WebSocket client connected');
			// Handle incoming messages from the WebSocket client
			ws.on('message', async (message) => {
				console.log(`Received: ${message}`);
				// Parse Handshake Request
				// wait for appToken to authenticate
				try {
					const { appToken } = JSON.parse(message.toString());
					const { payload } = await jwtVerify(appToken, secret);
					openSockets.set(payload.did as string, ws);
					ws.send(JSON.stringify({ type: "FIN_INIT" }));
					console.log("Handshake established");
				}
				catch(e) {
					console.log("Handshake failed ", e);
				}
			});
			ws.on('close', () => {
				console.log('socket closed----')
			})
		});
	}

	async send(userDid: string, message: ServerSocketMessage): Promise<Result<void, void>> {
		const ws = openSockets.get(userDid);
		ws.send(JSON.stringify(message));
		return Ok.EMPTY;
	}

	async expect(userDid: string, message_id: string, action: SignatureAction): Promise<Result<{ message: ClientSocketMessage }, ExpectingSocketMessageErr>> {
		const ws = openSockets.get(userDid);
		return new Promise((resolve, reject) => {
			ws.onmessage = event => {
				try {
					const clientMessage = JSON.parse(event.data.toString()) as ClientSocketMessage;
					if (message_id !== clientMessage.message_id) {
						console.error("Wrong message id")
						return resolve(Err(ExpectingSocketMessageErr.WRONG_MESSAGE_ID));
					}
					if (action !== clientMessage.response.action) {
						return resolve(Err(ExpectingSocketMessageErr.WRONG_ACTION));
					}
					return resolve(Ok({ message: clientMessage }));
				}
				catch(e) {
					resolve(Err(ExpectingSocketMessageErr.FAILED_TO_RECEIVE));
				}
			}
		})

	}



}