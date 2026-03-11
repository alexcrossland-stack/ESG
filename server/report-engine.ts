import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType, AlignmentType, BorderStyle } from "docx";

interface ReportSection {
  title: string;
  type: "text" | "table" | "metrics" | "list";
  content?: string;
  items?: string[];
  rows?: { label: string; value: string; status?: string }[];
  tableHeaders?: string[];
  tableRows?: string[][];
}

interface ReportData {
  title: string;
  period?: string;
  sections: ReportSection[];
  summary?: string;
}

export async function generatePdf(reportData: ReportData, reportType: string, companyName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).fillColor("#1a7a52").text(companyName, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(14).fillColor("#333").text(formatReportType(reportType), { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#666").text(
      `Generated: ${new Date().toLocaleDateString("en-GB")}${reportData.period ? ` | Period: ${reportData.period}` : ""}`,
      { align: "center" }
    );
    doc.moveDown(0.3);
    doc.strokeColor("#1a7a52").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    if (reportData.summary) {
      doc.fontSize(10).fillColor("#444").text(reportData.summary);
      doc.moveDown(1);
    }

    for (const section of reportData.sections) {
      if (doc.y > 700) doc.addPage();

      doc.fontSize(13).fillColor("#1a7a52").text(section.title);
      doc.moveDown(0.3);
      doc.strokeColor("#ddd").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      if (section.type === "text" && section.content) {
        doc.fontSize(10).fillColor("#333").text(section.content);
        doc.moveDown(0.8);
      }

      if (section.type === "list" && section.items) {
        for (const item of section.items) {
          doc.fontSize(10).fillColor("#333").text(`  •  ${item}`);
        }
        doc.moveDown(0.8);
      }

      if (section.type === "metrics" && section.rows) {
        const tableTop = doc.y;
        const colWidths = [250, 120, 120];
        const startX = 50;

        doc.fontSize(9).fillColor("#666");
        doc.text("Metric", startX, tableTop);
        doc.text("Value", startX + colWidths[0], tableTop);
        doc.text("Status", startX + colWidths[0] + colWidths[1], tableTop);
        doc.moveDown(0.3);
        doc.strokeColor("#ccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.3);

        for (const row of section.rows) {
          if (doc.y > 720) doc.addPage();
          const y = doc.y;
          doc.fontSize(9).fillColor("#333");
          doc.text(row.label, startX, y, { width: colWidths[0] - 10 });
          doc.text(row.value, startX + colWidths[0], y, { width: colWidths[1] - 10 });
          const statusColor = row.status === "green" ? "#16a34a" : row.status === "amber" ? "#d97706" : row.status === "red" ? "#dc2626" : "#666";
          doc.fillColor(statusColor).text(row.status || "-", startX + colWidths[0] + colWidths[1], y);
          doc.moveDown(0.2);
        }
        doc.moveDown(0.8);
      }

      if (section.type === "table" && section.tableHeaders && section.tableRows) {
        const headers = section.tableHeaders;
        const colW = Math.floor(495 / headers.length);
        const startX = 50;

        doc.fontSize(9).fillColor("#666");
        headers.forEach((h, i) => doc.text(h, startX + i * colW, doc.y, { width: colW - 5, continued: i < headers.length - 1 }));
        doc.moveDown(0.3);
        doc.strokeColor("#ccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.3);

        for (const row of section.tableRows) {
          if (doc.y > 720) doc.addPage();
          doc.fontSize(9).fillColor("#333");
          row.forEach((cell, i) => doc.text(cell || "-", startX + i * colW, doc.y, { width: colW - 5, continued: i < row.length - 1 }));
          doc.moveDown(0.2);
        }
        doc.moveDown(0.8);
      }
    }

    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor("#999").text(
        `${companyName} | ${formatReportType(reportType)} | Page ${i + 1} of ${pages.count}`,
        50, 780, { align: "center", width: 495 }
      );
    }

    doc.end();
  });
}

export async function generateDocx(reportData: ReportData, reportType: string, companyName: string): Promise<Buffer> {
  const children: any[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: companyName, bold: true, size: 36, color: "1a7a52" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: formatReportType(reportType), size: 28, color: "333333" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: `Generated: ${new Date().toLocaleDateString("en-GB")}${reportData.period ? ` | Period: ${reportData.period}` : ""}`,
        size: 20, color: "666666", italics: true,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  if (reportData.summary) {
    children.push(new Paragraph({
      children: [new TextRun({ text: reportData.summary, size: 22 })],
      spacing: { after: 300 },
    }));
  }

  for (const section of reportData.sections) {
    children.push(new Paragraph({
      text: section.title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    }));

    if (section.type === "text" && section.content) {
      children.push(new Paragraph({
        children: [new TextRun({ text: section.content, size: 22 })],
        spacing: { after: 200 },
      }));
    }

    if (section.type === "list" && section.items) {
      for (const item of section.items) {
        children.push(new Paragraph({
          children: [new TextRun({ text: item, size: 22 })],
          bullet: { level: 0 },
          spacing: { after: 60 },
        }));
      }
    }

    if (section.type === "metrics" && section.rows) {
      const headerRow = new TableRow({
        children: ["Metric", "Value", "Status"].map(h => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
          width: { size: 33, type: WidthType.PERCENTAGE },
        })),
      });
      const dataRows = section.rows.map(r => new TableRow({
        children: [r.label, r.value, r.status || "-"].map(cell => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20 })] })],
          width: { size: 33, type: WidthType.PERCENTAGE },
        })),
      }));
      children.push(new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 100, type: WidthType.PERCENTAGE },
      }));
    }

    if (section.type === "table" && section.tableHeaders && section.tableRows) {
      const colPercent = Math.floor(100 / section.tableHeaders.length);
      const headerRow = new TableRow({
        children: section.tableHeaders.map(h => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
          width: { size: colPercent, type: WidthType.PERCENTAGE },
        })),
      });
      const dataRows = section.tableRows.map(row => new TableRow({
        children: row.map(cell => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: cell || "-", size: 20 })] })],
          width: { size: colPercent, type: WidthType.PERCENTAGE },
        })),
      }));
      children.push(new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 100, type: WidthType.PERCENTAGE },
      }));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function formatReportType(type: string): string {
  const labels: Record<string, string> = {
    board_pack: "Board Pack Report",
    customer_pack: "Customer Response Pack",
    compliance_summary: "Compliance Summary Report",
    assurance_pack: "Assurance Pack",
    register: "ESG Register",
    management: "Internal Management Report",
    customer: "Customer / Supplier Response Pack",
    annual: "Annual ESG Summary",
  };
  return labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}
