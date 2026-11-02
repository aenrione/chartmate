/** MCP content blocks. Text-only for now — every tool returns JSON as text. */
export type McpContent = {type: 'text'; text: string};

export type McpTool = {
  name: string;
  description: string;
  /** JSON Schema shown to the model. Keep descriptions concrete. */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  run(args: Record<string, any>): Promise<McpContent[]>;
};

/** Wrap a value as a single text block, pretty-printing anything non-string. */
export function text(value: unknown): McpContent[] {
  return [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ];
}
