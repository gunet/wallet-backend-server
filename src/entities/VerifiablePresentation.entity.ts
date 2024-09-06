import { Err, Ok, Result } from "ts-results";
import { Entity, EntityManager, PrimaryGeneratedColumn, Column, Repository} from "typeorm"
import AppDataSource from "../AppDataSource";

// export enum PresentationTypes {
// 	JWT_VP = 'jwt_vp',
// 	LDP_VP = 'ldp_vp'
// }
@Entity({ name: "verifiable_presentation" })
export class VerifiablePresentationEntity {
	@PrimaryGeneratedColumn()
	id: number = -1;


	@Column({ nullable: false })
	presentationIdentifier: string = "";

	@Column({ type: 'blob', nullable: false })
	presentation: string = "";

	@Column({ nullable: false })
	holderDID: string = "";

	@Column({ nullable: false, default: "" })
	audience: string = "";

	@Column({ nullable: false, default: "jwt_vp" })
	format: string = "jwt_vp";

	@Column({ type: "blob", nullable: false })
	includedVerifiableCredentialIdentifiers: string = "[]";


	@Column({ type: 'blob', nullable: false })
	presentationSubmission: string = "{}";

	// @Column({ enum: PresentationTypes, type: 'enum', nullable: false })
	// format: PresentationTypes | null = null; // = PresentationTypes.JWT_VP; // 'ldp_vp' or 'jwt_vp'

	@Column({ type: "datetime", nullable: false })
	issuanceDate: Date = new Date();
}

const verifiablePresentationRepository: Repository<VerifiablePresentationEntity> = AppDataSource.getRepository(VerifiablePresentationEntity);


type VerifiablePresentation = {
	id?: number;
	presentationIdentifier: string;
	presentation: string;
	holderDID: string;
	includedVerifiableCredentialIdentifiers: string[];
	issuanceDate: Date;
	audience: string;
	presentationSubmission: any;
	format: string;
}

enum GetAllVerifiablePresentationsErr {
	DB_ERR = "DB_ERR"
}

enum CreateVerifiablePresentationErr {
	DB_ERR = "DB_ERR"
}

enum DeleteVerifiablePresentationErr {
	DB_ERR = "DB_ERR"
}

async function createVerifiablePresentation(createVp: VerifiablePresentation) {
	try {
		createVp.presentation = JSON.stringify(createVp.presentation);
		const res = await AppDataSource
			.createQueryBuilder()
			.insert()
			.into(VerifiablePresentationEntity).values([{
				...createVp,
				includedVerifiableCredentialIdentifiers: JSON.stringify(createVp.includedVerifiableCredentialIdentifiers),
				presentationSubmission: JSON.stringify(createVp.presentationSubmission)
			}])
			.execute();
		return Ok({});
	}
	catch(e) {
		console.log(e);
		return Err(CreateVerifiablePresentationErr);
	}
}

async function deletePresentationsByCredentialId(holderDID:string, credentialIdentifier: string): Promise<Result<number, DeleteVerifiablePresentationErr >> {
	try {
		// Get all verifiable presentations for the given holderDID
		const vpList = await getAllVerifiablePresentations(holderDID);

		const deletePromises: Promise<any>[] = [];

		for (const vp of vpList) {
			// Check if credentialIdentifier is in includedVerifiableCredentialIdentifiers
			if (vp.includedVerifiableCredentialIdentifiers.includes(credentialIdentifier)) {
				// Delete the presentation and push the promise to the array
				const deletePromise = verifiablePresentationRepository
					.createQueryBuilder()
					.delete()
					.from(VerifiablePresentationEntity)
					.where("id = :id", { id: vp.id })
					.execute();

				deletePromises.push(deletePromise);
			}
		}
		const deleteResults = await Promise.all(deletePromises);

		let totalAffectedRows = 0;
		for (const result of deleteResults) {
			totalAffectedRows += result.affected;
		}

		if (totalAffectedRows > 0) {
			console.log(`Total presentations deleted: ${totalAffectedRows}`);
			return Ok(totalAffectedRows);
		} else {
			console.log("No presentations were deleted");
			return Ok(0);
		}
	} catch (e) {
		console.log(e);
		return Err(DeleteVerifiablePresentationErr.DB_ERR);
	}
}

async function getAllVerifiablePresentations(holderDID: string): Promise<Result<VerifiablePresentation[], GetAllVerifiablePresentationsErr>> {
	try {
		const vpList = await verifiablePresentationRepository
			.createQueryBuilder("vp")
			.where("vp.holderDID = :did", { did: holderDID })
			.getMany();
		// convert all Blobs to string
		const decodedVpList = vpList.map((vp) => {
			const transformed: VerifiablePresentation = {
				...vp,
				presentation: JSON.parse(vp.presentation.toString()),
				includedVerifiableCredentialIdentifiers: JSON.parse(vp.includedVerifiableCredentialIdentifiers.toString()),
				presentationSubmission: JSON.parse(vp.presentationSubmission.toString())
			}
			return transformed;
		})
		console.log("Presentations = ", decodedVpList.length)
		return Ok(decodedVpList);
	}
	catch(e) {
		console.log(e);
		return Err(GetAllVerifiablePresentationsErr.DB_ERR);
	}

}


async function getPresentationByIdentifier(holderDID: string, presentationIdentifier: string): Promise<Result<VerifiablePresentation, GetAllVerifiablePresentationsErr>> {
	try {
		const vp = await verifiablePresentationRepository
			.createQueryBuilder("vp")
			.where("vp.presentationIdentifier = :presentationIdentifier and vp.holderDID = :holderDID", { holderDID, presentationIdentifier })
			.getOne();
		// convert all Blobs to string
		const transformed: VerifiablePresentation = {
			...vp,
			presentation: JSON.parse(vp.presentation.toString()),
			includedVerifiableCredentialIdentifiers: JSON.parse(vp.includedVerifiableCredentialIdentifiers.toString()),
			presentationSubmission: JSON.parse(vp.presentationSubmission.toString())
		}
		return Ok(transformed);
	}
	catch(e) {
		console.log(e);
		return Err(GetAllVerifiablePresentationsErr.DB_ERR);
	}

}

async function deleteAllPresentationsWithHolderDID(holderDID: string, options?: { entityManager: EntityManager }): Promise<Result<{}, DeleteVerifiablePresentationErr>> {
	try {
		return await (options?.entityManager || verifiablePresentationRepository.manager).transaction(async (manager) => {
			await manager
				.createQueryBuilder()
				.from(VerifiablePresentationEntity, "vp")
				.delete()
				.where("holderDID = :did", { did: holderDID })
				.execute();
			return Ok({});
		});
	}
	catch(e) {
		console.log(e);
		return Err(DeleteVerifiablePresentationErr.DB_ERR);
	}
}

export {
	CreateVerifiablePresentationErr,
	VerifiablePresentation,
	getAllVerifiablePresentations,
	createVerifiablePresentation,
	deletePresentationsByCredentialId,
	getPresentationByIdentifier,
	deleteAllPresentationsWithHolderDID
}
