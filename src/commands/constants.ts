export const TOKEN_ESTIMATION = {
  BATCH_SIZE: 50,
  MAX_FILES_TO_PROCESS: 200,
} as const;

export const FILE_READING = {
  MAX_FILES_FOR_DEPENDENCY_ANALYSIS: 500,
  MAX_FILE_SIZE_BYTES: 1024 * 1024,
  BATCH_SIZE: 20,
} as const;

export const OUTPUT_FORMATS = ['markdown', 'json', 'plain', 'toon'] as const;
export type OutputFormat = typeof OUTPUT_FORMATS[number];

export function isValidOutputFormat(format: unknown): format is OutputFormat {
  return typeof format === 'string' && OUTPUT_FORMATS.includes(format as OutputFormat);
}
