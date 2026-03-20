#!/usr/bin/env bun
/**
 * End-to-End PDF Processing Test
 *
 * This simulates the full PDF processing workflow
 */

import * as pdfjsLib from "pdfjs-dist";
import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import { join } from "path";

const RELAY_DIR = join(process.env.HOME || "~", ".claude-relay");
const TEMP_DIR = join(RELAY_DIR, "temp");
const UPLOADS_DIR = join(process.env.HOME || "~", ".claude-relay", "uploads");

console.log("🧪 End-to-End PDF Processing Test\n");
console.log("=".repeat(60) + "\n");

async function testPDFProcessing() {
  try {
    // Test 1: Create directories
    console.log("📁 Step 1: Setting up directories...");
    await mkdir(TEMP_DIR, { recursive: true });
    await mkdir(UPLOADS_DIR, { recursive: true });
    console.log("✅ Directories ready");

    // Test 2: Create a test PDF
    console.log("\n📄 Step 2: Creating test PDF...");
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
endobj
4 0 obj
<<
/Length 72
>>
stream
BT
/F1 14 Tf
100 700 Td
(Prueba de PDF - Extracto de Texto) Tj
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
283
%%EOF
`;

    const timestamp = Date.now();
    const testFileName = `test_${timestamp}.pdf`;
    const testFilePath = join(UPLOADS_DIR, testFileName);

    await writeFile(testFilePath, testPdfContent);
    console.log(`✅ Test PDF created: ${testFilePath}`);

    // Test 3: Verify file exists
    console.log("\n✓ Step 3: Verifying file...");
    try {
      const { stat } = await import("fs/promises");
      const fileStats = await stat(testFilePath);
      console.log(`✅ File verified: ${fileStats.size} bytes`);
    } catch (statError) {
      console.log("❌ File verification failed:", statError);
      throw new Error("File could not be saved or accessed");
    }

    // Test 4: Extract text using pdfjs-dist
    console.log("\n🔍 Step 4: Extracting text with PDF.js...");
    try {
      const pdfBuffer = await readFile(testFilePath);
      console.log(`📖 PDF file read: ${pdfBuffer.length} bytes`);

      const pdfData = await pdfjsLib.getDocument({
        data: pdfBuffer,
        cMapUrl: "node_modules/pdfjs-dist/cmaps/",
        standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/",
        useWorkerFetch: false,
      }).promise;

      let fullText = "";
      const numPages = pdfData.numPages;
      console.log(`📖 PDF loaded: ${numPages} pages`);

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
      console.log(`📝 Extracted text: ${extractedText.length} characters`);
      console.log(`📄 Extracted content: "${extractedText}"`);

      if (extractedText.length === 0) {
        console.log("⚠️  Warning: Extracted text is empty!");
      }

      // Test 5: Cleanup
      console.log("\n🧹 Step 5: Cleaning up...");
      await unlink(testFilePath);
      console.log("✅ Cleanup completed");

      return {
        success: true,
        text: extractedText,
        pages: numPages,
        fileSize: pdfBuffer.length
      };
    } catch (pdfError) {
      console.error("❌ PDF extraction error:", pdfError);
      if (pdfError instanceof Error) {
        console.error("Error type:", pdfError.name);
        console.error("Error message:", pdfError.message);
        console.error("Error stack:", pdfError.stack);
      }
      return {
        success: false,
        error: pdfError instanceof Error ? pdfError.message : String(pdfError)
      };
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Run the test
console.log("🚀 Starting PDF processing test...\n");
const result = await testPDFProcessing();

console.log("\n" + "=".repeat(60) + "\n");
console.log("📊 Test Results:\n");

if (result.success) {
  console.log("✅ PDF processing test PASSED");
  console.log(`📝 Text extracted: "${result.text}"`);
  console.log(`📄 Pages: ${result.pages}`);
  console.log(`📊 File size: ${result.fileSize} bytes`);
  console.log("\n✨ The bot should work correctly with PDF files now!");
} else {
  console.log("❌ PDF processing test FAILED");
  console.log(`❌ Error: ${result.error}`);
  console.log("\n⚠️  There might be an issue with the PDF processing in the bot.");
  console.log("💡 Try sending a simple PDF to the bot and check the error message.");
}

console.log("\n" + "=".repeat(60) + "\n");
console.log("🎯 If the test passed, try sending a PDF to your bot!");
console.log("🔗 Bot: @claudemac2brainbot\n");
