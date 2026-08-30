import type { MigrationResult, ProjectRecord } from "./types";
import { getProjectId } from "./utils";

export function transformProjectV31ToV32({
	project,
}: {
	project: ProjectRecord;
}): MigrationResult<ProjectRecord> {
	if (!getProjectId({ project })) {
		return { project, skipped: true, reason: "no project id" };
	}

	const version = project.version;
	if (typeof version !== "number") {
		return { project, skipped: true, reason: "invalid version" };
	}
	if (version >= 32) {
		return { project, skipped: true, reason: "already v32" };
	}
	if (version !== 31) {
		return { project, skipped: true, reason: "not v31" };
	}

	const existingRevision = project.revision;
	const revision =
		typeof existingRevision === "number" &&
		Number.isSafeInteger(existingRevision) &&
		existingRevision >= 0
			? existingRevision
			: 0;

	return {
		project: {
			...project,
			revision,
			version: 32,
		},
		skipped: false,
	};
}
