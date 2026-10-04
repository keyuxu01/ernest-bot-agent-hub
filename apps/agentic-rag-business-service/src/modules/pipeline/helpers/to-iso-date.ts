/** ES date 字段需要 ISO-8601；Date#toString() 会被拒绝 */
function toIsoDate(value?: Date | string | null): string | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export { toIsoDate };
