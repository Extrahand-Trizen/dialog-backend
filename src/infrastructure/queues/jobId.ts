/** BullMQ custom job IDs must not contain `:`. */
const JOB_ID_PART_SEPARATOR = '__';

export function buildJobId(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/:/g, '_'))
    .join(JOB_ID_PART_SEPARATOR);
}
