import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const jsonIndentation = 4;

export const persistentDataDirectory = process.env.SHIORI_DATA_DIRECTORY ?? join(process.cwd(), 'data');

export async function synchronizeDirectory(directoryPath: string): Promise<void> {
	const directory = await open(directoryPath, 'r');
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}

async function writeDurableFile(destinationPath: string, source: string): Promise<void> {
	const temporaryPath = `${destinationPath}.${randomUUID()}.tmp`;
	let renamed = false;

	try {
		const temporaryFile = await open(temporaryPath, 'wx', 0o600);
		try {
			await temporaryFile.writeFile(source, 'utf8');
			await temporaryFile.sync();
		} finally {
			await temporaryFile.close();
		}

		await rename(temporaryPath, destinationPath);
		renamed = true;
		await synchronizeDirectory(dirname(destinationPath));
	} catch (error: unknown) {
		if (!renamed) {
			await unlink(temporaryPath).catch(() => undefined);
		}
		throw error;
	}
}

function jsonFileContents(data: unknown): string {
	const serialized = JSON.stringify(data, null, jsonIndentation);
	if (serialized === undefined) {
		throw new Error('Cannot persist an undefined JSON value.');
	}
	return `${serialized}\n`;
}

/** Atomically writes a JSON data file and retains its previous version as a neighbouring backup. */
export async function writeManagedJsonFile(
	filePath: string,
	data: unknown,
	preserveExistingBackup = false
): Promise<void> {
	const source = jsonFileContents(data);
	await mkdir(dirname(filePath), { recursive: true });
	if (existsSync(filePath) && !preserveExistingBackup) {
		await writeDurableFile(`${filePath}.backup`, await readFile(filePath, 'utf8'));
	}
	await writeDurableFile(filePath, source);
}
