import { SignJWT, importJWK, jwtVerify } from "jose";
import { AdditionalKeystoreParameters, DidKeyUtilityService, WalletKeystore } from "./interfaces";
import { getUserByUsername, storeKeypair } from "../entities/user.entity";
import { SignVerifiablePresentationJWT, WalletKey } from "@gunet/ssi-sdk";
import { randomUUID } from "crypto";
import { verifiablePresentationSchemaURL } from "../util/util";
import { inject, injectable } from "inversify";

import "reflect-metadata";
import { TYPES } from "./types";


@injectable()
export class DatabaseKeystoreService implements WalletKeystore {

	private readonly algorithm = "EdDSA";

	constructor(
		@inject(TYPES.DidKeyUtilityService) private didKeyService: DidKeyUtilityService,
	) { }

	async generateKeyPair(username: string): Promise<{ did: string }> {
		const { did, key } = await this.didKeyService.generateKeyPair();
		storeKeypair(username, did, Buffer.from(JSON.stringify(key)));
		return { did: did }
	}

	async createIdToken(username: string, nonce: string, audience: string, additionalParameters: AdditionalKeystoreParameters): Promise<{ id_token: string; }> {

		const user = (await getUserByUsername(username)).unwrap();

		const keys = JSON.parse(user.keys.toString());
		const privateKey = await importJWK(keys.privateKeyJwk, this.algorithm);

		const jws = await new SignJWT({ nonce: nonce })
			.setProtectedHeader({
				alg: this.algorithm,
				typ: "JWT",
				kid: keys.id,
			})
			.setSubject(user.did)
			.setIssuer(user.did)
			.setExpirationTime('1m')
			.setAudience(audience)
			.setIssuedAt()
			.sign(privateKey);

		return { id_token: jws };	
	}

	async signJwtPresentation(username: string, nonce: string, audience: string, verifiableCredentials: any[], additionalParameters: AdditionalKeystoreParameters): Promise<{ vpjwt: string }> {
		const user = (await getUserByUsername(username)).unwrap();
		const keys = JSON.parse(user.keys.toString());
		const privateKey = await importJWK(keys.privateKeyJwk, this.algorithm);

		const jws = await new SignVerifiablePresentationJWT()
			.setProtectedHeader({
				alg: this.algorithm,
				typ: "JWT",
				kid: keys.id,
			})
			.setVerifiableCredential(verifiableCredentials)
			.setContext(["https://www.w3.org/2018/credentials/v1"])
			.setType(["VerifiablePresentation"])
			.setAudience(audience)
			.setCredentialSchema(
				verifiablePresentationSchemaURL, 
				"FullJsonSchemaValidator2021")
			.setIssuer(user.did)
			.setSubject(user.did)
			.setHolder(user.did)
			.setJti(`urn:id:${randomUUID()}`)
			.setNonce(nonce)
			.setIssuedAt()
			.setExpirationTime('1m')
			.sign(privateKey);
		return { vpjwt: jws };
	}

	async generateOpenid4vciProof(username: string, audience: string, nonce: string, additionalParameters: AdditionalKeystoreParameters): Promise<{ proof_jwt: string }> {

		const user = (await getUserByUsername(username)).unwrap();

		const keys = JSON.parse(user.keys.toString());
		const privateKey = await importJWK(keys.privateKeyJwk, this.algorithm);
		const header = {
			alg: this.algorithm,
			typ: "openid4vci-proof+jwt",
			kid: keys.id
		};
		
		const jws = await new SignJWT({ nonce: nonce ? nonce : "" })
			.setProtectedHeader(header)
			.setIssuedAt()
			.setIssuer(user.did)
			.setAudience(audience)
			// .setExpirationTime('1m')
			.sign(privateKey);

		return { proof_jwt: jws };
	}
	async getIdentifier(username: string): Promise<string> {
		const user = (await getUserByUsername(username)).unwrap();
		return user.did;
	}


	
}