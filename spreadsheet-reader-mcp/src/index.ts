#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as XLSX from "xlsx";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

// ESM 환경에서 SheetJS가 파일 시스템에 접근할 수 있도록 설정
XLSX.set_fs(fs);

// Create the MCP server
const server = new McpServer({
  name: "spreadsheet-reader-mcp",
  version: "1.0.0",
});

// Helper function to validate file path
function validateFilePath(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }
  const ext = path.extname(resolvedPath).toLowerCase();
  const supportedExtensions = [".xlsx", ".xls", ".csv", ".ods"];
  if (!supportedExtensions.includes(ext)) {
    throw new Error(
      `Unsupported file format: ${ext}. Supported formats: ${supportedExtensions.join(", ")}`
    );
  }
  return resolvedPath;
}

// Helper function to get worksheet
function getWorksheet(
  workbook: XLSX.WorkBook,
  sheetName?: string
): XLSX.WorkSheet {
  const targetSheet = sheetName || workbook.SheetNames[0];
  if (!workbook.SheetNames.includes(targetSheet)) {
    throw new Error(
      `Sheet "${targetSheet}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`
    );
  }
  return workbook.Sheets[targetSheet];
}

// Tool 1: read_spreadsheet
server.tool(
  "read_spreadsheet",
  "Read a spreadsheet file and return data as JSON. When useHeader is true, returns array of objects with column headers as keys. When false, returns 2D array.",
  {
    filePath: z.string().describe("Path to the spreadsheet file"),
    sheetName: z
      .string()
      .optional()
      .describe("Name of the sheet to read (defaults to first sheet)"),
    useHeader: z
      .boolean()
      .default(true)
      .describe("Use first row as header for JSON object keys (default: true)"),
  },
  async (args) => {
    try {
      const resolvedPath = validateFilePath(args.filePath);
      const workbook = XLSX.readFile(resolvedPath);
      const worksheet = getWorksheet(workbook, args.sheetName);

      let data: unknown;
      if (args.useHeader) {
        // Convert to array of objects with headers as keys
        data = XLSX.utils.sheet_to_json(worksheet);
      } else {
        // Convert to 2D array
        data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 2: list_sheets
server.tool(
  "list_sheets",
  "List all sheet names in a spreadsheet file",
  {
    filePath: z.string().describe("Path to the spreadsheet file"),
  },
  async (args) => {
    try {
      const resolvedPath = validateFilePath(args.filePath);
      const workbook = XLSX.readFile(resolvedPath);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                sheets: workbook.SheetNames,
                count: workbook.SheetNames.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 3: get_cell_range
server.tool(
  "get_cell_range",
  "Read a specific cell range from a spreadsheet and return as 2D array",
  {
    filePath: z.string().describe("Path to the spreadsheet file"),
    sheetName: z
      .string()
      .optional()
      .describe("Name of the sheet (defaults to first sheet)"),
    range: z.string().describe('Cell range to read (e.g., "A1:D10")'),
  },
  async (args) => {
    try {
      const resolvedPath = validateFilePath(args.filePath);
      const workbook = XLSX.readFile(resolvedPath);
      const worksheet = getWorksheet(workbook, args.sheetName);

      // Parse the range
      const rangeObj = XLSX.utils.decode_range(args.range);

      // Extract data from the specified range
      const data: unknown[][] = [];
      for (let row = rangeObj.s.r; row <= rangeObj.e.r; row++) {
        const rowData: unknown[] = [];
        for (let col = rangeObj.s.c; col <= rangeObj.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress];
          rowData.push(cell ? cell.v : null);
        }
        data.push(rowData);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                range: args.range,
                data: data,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 4: get_sheet_info
server.tool(
  "get_sheet_info",
  "Get metadata about a spreadsheet sheet including row count, column count, and used range",
  {
    filePath: z.string().describe("Path to the spreadsheet file"),
    sheetName: z
      .string()
      .optional()
      .describe("Name of the sheet (defaults to first sheet)"),
  },
  async (args) => {
    try {
      const resolvedPath = validateFilePath(args.filePath);
      const workbook = XLSX.readFile(resolvedPath);
      const targetSheet = args.sheetName || workbook.SheetNames[0];
      const worksheet = getWorksheet(workbook, args.sheetName);

      // Get the used range
      const range = worksheet["!ref"];
      let rowCount = 0;
      let colCount = 0;
      let startCell = "";
      let endCell = "";

      if (range) {
        const rangeObj = XLSX.utils.decode_range(range);
        rowCount = rangeObj.e.r - rangeObj.s.r + 1;
        colCount = rangeObj.e.c - rangeObj.s.c + 1;
        startCell = XLSX.utils.encode_cell(rangeObj.s);
        endCell = XLSX.utils.encode_cell(rangeObj.e);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                sheetName: targetSheet,
                usedRange: range || "empty",
                startCell: startCell || "N/A",
                endCell: endCell || "N/A",
                rowCount: rowCount,
                columnCount: colCount,
                totalSheets: workbook.SheetNames.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Main function to start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Spreadsheet Reader MCP server started successfully");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
