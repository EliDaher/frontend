type ConflictOperationSnapshot = {
  action: string;
  payload: Record<string, unknown>;
  baseVersion?: number;
  dependencyIds: string[];
  createdAt: string;
};

export function localConflictPayload(operation: ConflictOperationSnapshot) {
  return {
    action: operation.action,
    payload: operation.payload,
    baseVersion: operation.baseVersion,
    dependencyIds: [...operation.dependencyIds],
    clientCreatedAt: operation.createdAt
  };
}
