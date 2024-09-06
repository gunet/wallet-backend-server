import { Err, Ok, Result } from "ts-results";
import { Entity, PrimaryColumn, Column, Repository} from "typeorm"
import AppDataSource from "../AppDataSource";
import crypto from "node:crypto";
import { UserId } from "./user.entity";
@Entity({ name: "webauthn_challenge" })
class WebauthnChallengeEntity {
	@PrimaryColumn()
	id: string;

	@Column({ nullable: false})
	type: string;

	/**
	 * This was renamed in PR (TBD).
	 * We keep the old database column name for forward- and backwards compatibility between application and schema versions.
	 */
	@Column({
		name: "userHandle",
		type: "varchar",
		length: 255,
		nullable: true,
		// Explicit default to workaround a bug in typeorm: https://github.com/typeorm/typeorm/issues/3076#issuecomment-703128687
		default: () => "NULL",
		transformer: { from: (id) => id && UserId.fromId(id), to: (userId: UserId) => userId?.id },
	})
	userId?: UserId;

	@Column({ nullable: false })
	challenge: Buffer;

	// Explicit default to workaround a bug in typeorm: https://github.com/typeorm/typeorm/issues/3076#issuecomment-703128687
	@Column({ nullable: true, default: () => "NULL" })
	prfSalt: Buffer;

	@Column({ type: "datetime", nullable: false })
	createTime: Date;
}

const TIMEOUT_MILLISECONDS = 15 * 60 * 1000;

type CreatedChallenge = {
	id: string;
	userId?: UserId;
	challenge: Buffer;
	prfSalt?: Buffer;
}

enum ChallengeErr {
	NOT_EXISTS = "NOT_EXISTS",
	DB_ERR = "DB_ERR",
	EXPIRED = "EXPIRED",
}

const challengeRepository: Repository<WebauthnChallengeEntity> = AppDataSource.getRepository(WebauthnChallengeEntity);


async function createChallenge(type: "create" | "get", userId?: UserId, prfSalt?: Buffer): Promise<Result<CreatedChallenge, ChallengeErr>> {
	try {
		const returnData = {
			userId,
			prfSalt,
			id: crypto.randomUUID(),
			challenge: crypto.randomBytes(32),
		};

		const entity = challengeRepository.create({
			...returnData,
			type,
			createTime: new Date(),
		});
		await challengeRepository.save(entity);

		return Ok(returnData);
	}
	catch (e) {
		console.log(e);
		return Err(ChallengeErr.DB_ERR);
	}
}

async function popChallenge(id: string): Promise<Result<WebauthnChallengeEntity, ChallengeErr>> {
	return await challengeRepository.manager.transaction(async (manager) => {
		try {
			const res = await manager.findOne(WebauthnChallengeEntity, { where: { id } });

			if (!res) {
				return Err(ChallengeErr.NOT_EXISTS);
			}

			const timeoutThreshold = Date.now() - TIMEOUT_MILLISECONDS;

			if (res.createTime.getTime() > timeoutThreshold) {
				await manager.delete(WebauthnChallengeEntity, { id });
				return Ok(res);

			} else {
				await manager
					.createQueryBuilder()
					.delete()
					.from(WebauthnChallengeEntity)
					.where("createTime <= :timeoutThreshold", { timeoutThreshold })
					.execute();
				return Err(ChallengeErr.EXPIRED);
			}
		}
		catch (e) {
			console.log(e);
			return Err(ChallengeErr.DB_ERR);
		}
	});
}

export {
	WebauthnChallengeEntity,
	ChallengeErr,
	createChallenge,
	popChallenge,
}
