export type ValidationIssue = Readonly<{
	message: string;
	path: readonly PropertyKey[];
}>;

export function formatValidationIssues(issues: readonly ValidationIssue[], root = 'document'): string {
	return issues
		.map((issue) => {
			const location = issue.path.map(String).join('.') || root;
			return `${location}: ${issue.message}`;
		})
		.join('\n');
}
