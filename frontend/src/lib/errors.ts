import type { Issue } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly issues: Issue[] | undefined;

  constructor(message: string, status: number, issues?: Issue[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}
