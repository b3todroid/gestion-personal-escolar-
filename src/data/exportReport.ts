import type { Report } from "./reports";
import { visibleSections } from "./reports";
import type { SchoolSettings } from "./types";
import { toCsv } from "@/domain/csv";

export function reportToCsv(r: Report): string {
  const rows: string[][] = [[r.schoolName], [r.title], ...r.filters.map((f) => [f]), [`Generado: ${new Date(r.generatedAt).toLocaleString("es-MX")}`], [], ...r.summary.map((s) => [s.label, s.value]), []];
  for (const s of visibleSections(r)) rows.push([s.heading], s.columns, ...s.rows, []);
  return toCsv(rows);
}

export async function reportToXlsx(r: Report): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const sheets = [{
    sheet: "Resumen",
    data: [[bold(r.schoolName)], [bold(r.title)], ...r.filters.map((f) => [f]), [], ...r.summary.map((s) => [bold(s.label), s.value])],
  }];
  const used = new Set(["Resumen"]);
  for (const s of visibleSections(r)) {
    let name = s.heading.replace(/[\\/?*[\]:]/g, " ").slice(0, 28);
    while (used.has(name)) name = `${name.slice(0, 26)}_${used.size}`;
    used.add(name);
    const numeric = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
    sheets.push({ sheet: name, data: [s.columns.map(bold), ...s.rows.map((row) => row.map(numeric))] as never });
  }
  return await writeExcelFile(sheets as never).toBlob();
}

export async function reportToPdf(r: Report, settings: SchoolSettings): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const sections = visibleSections(r);
  const wide = sections.some((s) => s.columns.length > 6);
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;

  if (settings.logoDataUrl) {
    try {
      const fmt = /^data:image\/(png|jpe?g)/i.exec(settings.logoDataUrl)?.[1]?.toUpperCase().replace("JPG", "JPEG") ?? "PNG";
      doc.addImage(settings.logoDataUrl, fmt, M, y, 48, 48);
    } catch { /* un logo inválido no debe impedir el reporte */ }
  }
  const tx = settings.logoDataUrl ? M + 60 : M;
  doc.setFont("helvetica", "bold").setFontSize(14).text(r.schoolName, tx, y + 14);
  doc.setFontSize(12).text(r.title, tx, y + 32);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  const meta = [settings.cct ? `CCT: ${settings.cct}` : "", `Generado: ${new Date(r.generatedAt).toLocaleString("es-MX", { timeZone: settings.timezone })}`].filter(Boolean).join("   -   ");
  doc.text(meta, tx, y + 46);
  y += 64;
  doc.setTextColor(0).setFontSize(10);
  for (const f of r.filters) { doc.text(f, M, y); y += 13; }
  y += 4;

  if (r.summary.length > 0) {
    autoTable(doc, { startY: y, margin: { left: M, right: M }, head: [["Indicador", "Valor"]], body: r.summary.map((s) => [s.label, s.value]), theme: "grid", styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [6, 95, 70] }, tableWidth: 260 });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }
  for (const s of sections) {
    if (y > H - 100) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "bold").setFontSize(11).text(s.heading, M, y);
    y += 6;
    autoTable(doc, { startY: y, margin: { left: M, right: M, bottom: 50 }, head: [s.columns], body: s.rows, showHead: "everyPage", theme: "striped", styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: [6, 95, 70] } });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  const sigs = settings.signatures.filter((s) => s.enabled);
  if (sigs.length > 0) {
    if (y > H - 130) { doc.addPage(); y = M; }
    y = Math.max(y + 30, y);
    const w = (W - 2 * M) / sigs.length;
    doc.setFontSize(9).setFont("helvetica", "normal");
    sigs.forEach((sg, i) => {
      const cx = M + w * i + w / 2;
      doc.line(cx - w / 2 + 12, y + 30, cx + w / 2 - 12, y + 30);
      doc.text(sg.name || "", cx, y + 42, { align: "center" });
      doc.setFont("helvetica", "bold").text(sg.label, cx, y + 54, { align: "center" }).setFont("helvetica", "normal");
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i).setFontSize(8).setTextColor(110);
    doc.text(`${r.schoolName} - ${r.title}`, M, H - 20);
    doc.text(`Página ${i} de ${pages}`, W - M, H - 20, { align: "right" });
  }
  return doc.output("blob");
}
