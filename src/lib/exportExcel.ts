import type { RegisterRow } from './types';
import { PRIORITY_LABEL, RISK_LABEL, STATUS_LABEL } from './format';

const COLUMNS: { header: string; width: number; get: (r: RegisterRow) => string | number | Date | null }[] = [
  { header: 'Action ID', width: 15, get: r => r.action_no },
  { header: 'Title', width: 40, get: r => r.title },
  { header: 'Description', width: 50, get: r => r.description },
  { header: 'Category', width: 22, get: r => r.category_name },
  { header: 'Source', width: 24, get: r => r.source_name },
  { header: 'Source reference', width: 18, get: r => r.source_reference },
  { header: 'QSE', width: 30, get: r => (r.qse_code ? `${r.qse_code} ${r.qse_name}` : null) },
  { header: 'ISO 15189:2022 clauses', width: 18, get: r => r.iso_clauses },
  { header: 'Department', width: 22, get: r => r.department_name },
  { header: 'Priority', width: 10, get: r => PRIORITY_LABEL[r.priority] },
  { header: 'Risk level', width: 11, get: r => RISK_LABEL[r.risk_level] },
  { header: 'Risk score (L×S)', width: 10, get: r => r.risk_score },
  { header: 'Action owner', width: 22, get: r => r.owner_name },
  { header: 'Assigned staff', width: 28, get: r => r.assigned_staff },
  { header: 'Start date', width: 12, get: r => d(r.start_date) },
  { header: 'Due date', width: 12, get: r => d(r.due_date) },
  { header: 'Original due date', width: 12, get: r => d(r.original_due_date) },
  { header: 'Completion date', width: 12, get: r => d(r.completion_date) },
  { header: 'Target outcome', width: 40, get: r => r.target_outcome },
  { header: 'Effectiveness measure', width: 36, get: r => r.success_measure },
  { header: 'Status', width: 20, get: r => STATUS_LABEL[r.status] + (r.is_blocked ? ' (blocked)' : '') },
  { header: 'Overdue (days)', width: 10, get: r => (r.is_overdue ? r.days_overdue : null) },
  { header: 'Implementation summary', width: 40, get: r => r.implementation_summary },
  { header: 'Verification result', width: 40, get: r => r.verification_result },
  { header: 'Effectiveness result', width: 40, get: r => r.effectiveness_result },
  { header: 'Closure authorized by', width: 22, get: r => r.closed_by_name },
  { header: 'Closed at', width: 18, get: r => (r.closed_at ? new Date(r.closed_at) : null) },
  { header: 'Reopened (times)', width: 10, get: r => r.reopened_count },
];

function d(v: string | null): Date | null {
  if (!v) return null;
  const [y, m, day] = v.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export async function exportRegister(rows: RegisterRow[], filterText: string, exportedBy: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LAB NLQS Action Plan Control';
  wb.created = new Date();
  const ws = wb.addWorksheet('Action Register', { views: [{ state: 'frozen', ySplit: 4, xSplit: 2 }] });

  ws.mergeCells(1, 1, 1, 8);
  ws.getCell(1, 1).value = 'LAB NLQS — Master Action Plan Register';
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFC2410C' } };
  ws.mergeCells(2, 1, 2, 12);
  ws.getCell(2, 1).value = `Exported ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' })} (ICT) by ${exportedBy} · ${rows.length} records · Filters: ${filterText || 'none'}`;
  ws.getCell(2, 1).font = { size: 9, color: { argb: 'FF64748B' } };

  const header = ws.getRow(4);
  COLUMNS.forEach((c, i) => {
    header.getCell(i + 1).value = c.header;
    ws.getColumn(i + 1).width = c.width;
  });
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8590C' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;

  rows.forEach((r, idx) => {
    const row = ws.getRow(5 + idx);
    COLUMNS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = c.get(r);
      cell.value = v as never;
      if (v instanceof Date) cell.numFmt = c.header === 'Closed at' ? 'dd-mmm-yyyy hh:mm' : 'dd-mmm-yyyy';
    });
    row.alignment = { vertical: 'top', wrapText: true };
    if (r.is_overdue) row.getCell(22).font = { bold: true, color: { argb: 'FFB91C1C' } };
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: COLUMNS.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `LAB-NLQS_Action_Register_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
