import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ZipArchive } from "archiver";
import ExcelJS from "exceljs";
import yauzl from "yauzl";
import { loadConfigFromFile } from "@prisma/config";

const root = mkdtempSync(join(tmpdir(), "avid-dependencies-"));
const require = createRequire(import.meta.url);
afterAll(() => rmSync(root, { recursive: true, force: true }));

function entryNames(bytes: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const names: string[] = [];
      zip.on("error", reject);
      zip.on("entry", (entry) => { names.push(entry.fileName); zip.readEntry(); });
      zip.on("end", () => resolve(names));
      zip.readEntry();
    });
  });
}

async function archiveDirectory(archive: ZipArchive): Promise<Buffer> {
  const source = join(root, "uploads");
  mkdirSync(join(source, "nested"), { recursive: true });
  writeFileSync(join(source, "nested", "data.txt"), "آزمون فایل تو در تو");
  writeFileSync(join(source, "root.txt"), "root");
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
  });
  archive.directory(source, "uploads");
  await archive.finalize();
  return finished;
}

test("Prisma 6 loads a config through the patched merge and schema dependencies", async () => {
  const config = join(root, "prisma.config.ts");
  writeFileSync(config, 'export default { schema: "prisma/schema.prisma" };');
  const result = await loadConfigFromFile({ configRoot: root, configFile: config });
  expect(result.error).toBeUndefined();
  expect(result.config?.schema).toBe(join(root, "prisma", "schema.prisma"));
});

test("current backup archiver traverses nested upload directories", async () => {
  const bytes = await archiveDirectory(new ZipArchive({ zlib: { level: 6 } }));
  expect(await entryNames(bytes)).toContain("uploads/nested/data.txt");
  expect(await entryNames(bytes)).toContain("uploads/root.txt");
});

test("ExcelJS's legacy archiver keeps its directory API with the fixed glob dependency", async () => {
  const excelRequire = createRequire(require.resolve("exceljs"));
  const legacyArchiver = excelRequire("archiver");
  const bytes = await archiveDirectory(legacyArchiver("zip"));
  expect(await entryNames(bytes)).toContain("uploads/nested/data.txt");
});

test("Excel export and import preserve Persian text, numbers and extended conditional formatting", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("حضور کلاس");
  sheet.addRows([["نام", "امتیاز"], ["کاربر آزمایشی", 18], ["کاربر دوم", 20]]);
  sheet.addConditionalFormatting({
    ref: "B2:B3",
    rules: [{ type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], gradient: false, border: true, priority: 1 }],
  });
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  expect(await entryNames(bytes)).toContain("xl/worksheets/sheet1.xml");
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(restored.worksheets[0].getCell("A2").value).toBe("کاربر آزمایشی");
  expect(restored.worksheets[0].getCell("B2").value).toBe(18);
});
