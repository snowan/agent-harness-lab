export type LabErrorCode =
  | "INVALID_INPUT"
  | "ILLEGAL_TRANSITION"
  | "ACTOR_NOT_AUTHORIZED"
  | "RUN_ALREADY_ACTIVE"
  | "STALE_REVISION"
  | "COMMAND_ABORTED"
  | "COMMAND_FAILED";

export class LabDomainError extends Error {
  readonly code: LabErrorCode;

  constructor(code: LabErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LabDomainError";
    this.code = code;
  }
}

export function isLabDomainError(error: unknown): error is LabDomainError {
  return error instanceof LabDomainError;
}
