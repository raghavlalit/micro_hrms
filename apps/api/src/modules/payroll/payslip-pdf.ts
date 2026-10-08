import { BadRequestException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { PayrollSnapshot } from './payroll-calculation.service';
export interface PayslipDocument {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  locked_at: Date;
  gross: string;
  deductions: string;
  net: string;
  snapshot: PayrollSnapshot;
  lines: { component_name: string; kind: string; amount: string }[];
}
/** Generate from the locked snapshot only, never from today's employee/salary data. */
export function payslipPdf(data: PayslipDocument): Promise<Buffer> {
  const customFont = process.env.PAYSLIP_FONT_PATH;
  if (
    !customFont &&
    /[^\x20-\x7e\r\n]/.test(
      [
        data.snapshot.company_name,
        data.snapshot.employee.name,
        data.snapshot.employee.employee_code,
        ...data.lines.map((line) => line.component_name),
      ].join(' '),
    )
  )
    throw new BadRequestException(
      'Configure PAYSLIP_FONT_PATH with a font covering company, employee and component names before publishing non-ASCII payslips',
    );
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      bufferPages: true,
      info: {
        Title: `Payslip ${data.period_start.slice(0, 7)}`,
        Author: 'Micro HRMS',
        CreationDate: data.locked_at,
        ModDate: data.locked_at,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      const regular = customFont || 'Helvetica',
        bold = customFont || 'Helvetica-Bold';
      doc.font(regular);
      const text = (value: string, size = 10, boldText = false) =>
        doc
          .font(boldText ? bold : regular)
          .fontSize(size)
          .fillColor('#213d46')
          .text(value, { width: 499 });
      text(data.snapshot.company_name, 21, true);
      doc.moveDown(0.5);
      text('PAYSLIP', 11, true);
      text(
        `${data.period_start} to ${data.period_end} | Pay date: ${data.pay_date}`,
      );
      doc.moveDown(1.3);
      text(data.snapshot.employee.name, 15, true);
      text(`Employee: ${data.snapshot.employee.employee_code}`);
      text(
        `Currency: ${data.snapshot.currency} | Calendar days: ${data.snapshot.calendar_days} | Employed days: ${data.snapshot.employed_days}`,
      );
      text(
        `Approved unpaid leave deducted: ${data.snapshot.unpaid_half_units / 2} day(s)`,
      );
      doc.moveDown(1.3);
      const row = (label: string, amount: string, heading = false) => {
        doc.font(heading ? bold : regular).fontSize(heading ? 11 : 10);
        const height = Math.max(
          18,
          doc.heightOfString(label, { width: 345 }) + 9,
        );
        if (doc.y + height > 740) {
          doc.addPage();
          text(
            `${data.snapshot.employee.employee_code} | ${data.period_start.slice(0, 7)} - continued`,
            10,
            true,
          );
          doc.moveDown();
          doc.font(heading ? bold : regular).fontSize(heading ? 11 : 10);
        }
        const y = doc.y;
        doc.fillColor('#213d46').text(label, 48, y, { width: 345 });
        doc.text(amount, 405, y, {
          width: 142,
          align: 'right',
          lineBreak: false,
        });
        doc.y = y + height;
        doc.x = 48;
      };
      for (const kind of ['earning', 'deduction']) {
        row(
          kind === 'earning' ? 'EARNINGS' : 'DEDUCTIONS',
          data.snapshot.currency,
          true,
        );
        for (const line of data.lines.filter(
          (line) => line.kind === kind && line.amount !== '0.00',
        ))
          row(line.component_name, line.amount);
        doc.moveDown(0.6);
      }
      // Keep the totals and explanatory note together at the end of a page.
      if (doc.y + 125 > 740) doc.addPage();
      row('Gross pay', data.gross, true);
      row('Total deductions', data.deductions, true);
      row('NET PAY', data.net, true);
      doc.moveDown();
      text(
        'Generated from reviewed and locked payroll. This statement does not confirm bank payment.',
        8,
      );
      text(`Reference: ${data.id}`, 8);
      const range = doc.bufferedPageRange();
      for (let index = 0; index < range.count; index++) {
        doc.switchToPage(index);
        // The footer sits below the content margin; prevent PDFKit adding a page.
        const bottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc
          .font(regular)
          .fontSize(8)
          .fillColor('#6a7d84')
          .text(
            `Micro HRMS | Confidential | Page ${index + 1} of ${range.count}`,
            48,
            790,
            { width: 499, align: 'center', lineBreak: false },
          );
        doc.page.margins.bottom = bottomMargin;
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
