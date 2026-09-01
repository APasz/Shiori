import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeManagedJsonFile } from './persistent-files';

let directory = '';

afterEach(async () => {
	if (directory) {
		await rm(directory, { force: true, recursive: true });
		directory = '';
	}
});

describe('persistent files', () => {
	it('rejects an undefined JSON value without replacing an existing file', async () => {
		directory = await mkdtemp(join(tmpdir(), 'shiori-persistent-files-test-'));
		const filePath = join(directory, 'data.json');
		const existingContents = '{"value": true}\n';
		await writeFile(filePath, existingContents, 'utf8');

		await expect(writeManagedJsonFile(filePath, undefined)).rejects.toThrow('Cannot persist an undefined JSON value.');

		expect(await readFile(filePath, 'utf8')).toBe(existingContents);
		await expect(readFile(`${filePath}.backup`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
	});
});
