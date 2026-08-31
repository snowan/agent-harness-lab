export type JsonSchema = Readonly<Record<string, unknown>>;

export interface WebMcpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
}

export interface WebMcpToolExecuteOptions {
  readonly signal: AbortSignal;
}

export interface WebMcpTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: JsonSchema;
  readonly annotations?: WebMcpToolAnnotations;
  readonly execute: (
    input: Record<string, unknown>,
    options: WebMcpToolExecuteOptions,
  ) => Promise<unknown>;
}

export interface WebMcpRegisterOptions {
  readonly signal?: AbortSignal;
  readonly exposedTo?: readonly string[];
}

export interface WebMcpModelContext {
  readonly registerTool: (
    tool: WebMcpTool,
    options?: WebMcpRegisterOptions,
  ) => Promise<void>;
}

export type DocumentWithModelContext = Document & {
  readonly modelContext?: WebMcpModelContext;
};
