#!/usr/bin/env bun
/**
 * PDF Processing Diagnostic Tool
 *
 * This script helps diagnose PDF processing issues
 */

import * as pdfjsLib from "pdfjs-dist";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";

console.log("🔍 PDF Processing Diagnostic Tool\n");
console.log("=".repeat(50) + "\n");

// Test 1: Check library version and installation
console.log("Test 1: Library Installation Check");
console.log("-".repeat(50));
try {
  console.log("✅ pdfjs-dist library is installed");
  console.log("Version: Mozilla PDF.js");
  console.log("Type: Module for PDF text extraction");
} catch (error) {
  console.log("❌ Library check failed");
  console.log("Error:", error);
}

console.log("\n" + "=".repeat(50) + "\n");

// Test 2: Create a simple test PDF
console.log("Test 2: Test PDF Creation");
console.log("-".repeat(50));

const testPdfContent = `
%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 55
>>
stream
BT
/F1 12 Tf
100 700 Td
(Hello World - PDF Test) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
0000000114 00000 n
0000000240 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
265
%%EOF
`;

try {
  const testPdfPath = join(process.cwd(), "test-diagnostic.pdf");
  await writeFile(testPdfPath, testPdfContent);
  console.log("✅ Test PDF created successfully");
} catch (error) {
  console.log("❌ Could not create test PDF");
  console.log("Error:", error);
}

console.log("\n" + "=".repeat(50) + "\n");

// Test 3: Test text extraction
console.log("Test 3: Text Extraction Test");
console.log("-".repeat(50));

try {
  const testPdfPath = join(process.cwd(), "test-diagnostic.pdf");
  const pdfBuffer = await readFile(testPdfPath);
  console.log("✅ Test PDF read successfully");
  console.log(`Buffer size: ${pdfBuffer.length} bytes`);

  console.log("Attempting text extraction with PDF.js...");
  const pdfData = await pdfjsLib.getDocument({
    data: pdfBuffer,
    cMapUrl: "node_modules/pdfjs-dist/cmaps/",
    standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/",
    useWorkerFetch: false,
  }).promise;

  let fullText = "";
  const numPages = pdfData.numPages;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfData.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  const extractedText = fullText.trim();

  console.log(`✅ Text extraction successful`);
  console.log(`Pages found: ${numPages}`);
  console.log(`Extracted text length: ${extractedText.length} characters`);
  console.log(`Extracted text: "${extractedText}"`);

  if (extractedText.length === 0) {
    console.log("⚠️  Warning: Extracted text is empty");
  }

  // Clean up
  await unlink(testPdfPath).catch(() => {});
  console.log("✅ Cleanup completed");

} catch (error) {
  console.log("❌ Text extraction failed");
  console.log("Error:", error);
  if (error instanceof Error) {
    console.log("Error stack:", error.stack);
  }
}

console.log("\n" + "=".repeat(50) + "\n");

// Test 4: Check Bun compatibility
console.log("Test 4: Bun Environment Check");
console.log("-".repeat(50));
console.log(`Bun version: ${Bun.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`Node compat: ${typeof window === 'undefined'}`);
console.log("✅ Environment info collected");

console.log("\n" + "=".repeat(50) + "\n");
console.log("🔍 Diagnostic tests completed!\n");
console.log("If all tests passed, the PDF processing should work.");
console.log("If tests failed, check the error messages above.");
