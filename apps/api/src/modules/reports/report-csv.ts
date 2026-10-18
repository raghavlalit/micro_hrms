import type { ReportColumn, ReportRow } from './report-read-model';
/** Quote every cell and neutralize spreadsheet formulas without rounding decimals. */
export function reportCsv(columns: ReportColumn[], rows: ReportRow[]) {
  const cell = (value: string | number | null | undefined, numeric = false) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (
      !(numeric && /^-?\d+(\.\d+)?$/.test(text)) &&
      // Control characters can conceal a leading spreadsheet formula.
      // eslint-disable-next-line no-control-regex
      /^[\s\u0000-\u001f]*[=+@-]/.test(text)
    )
      text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return (
    '\uFEFF' +
    [
      columns.map((column) => cell(column.label)).join(','),
      ...rows.map((row) =>
        columns
          .map((column) => cell(row[column.key], column.type === 'number'))
          .join(','),
      ),
    ].join('\r\n') +
    '\r\n'
  );
}
