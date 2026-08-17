import { execFileSync } from 'node:child_process';

function isGitWorktree() {
	try {
		execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

if (isGitWorktree()) {
	execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
}
