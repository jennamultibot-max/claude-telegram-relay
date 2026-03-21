#!/usr/bin/env bun
/**
 * Automated Plan M Analysis - Runs daily at 2:00 PM Europe/Madrid
 *
 * CORRECTED VERSION: Now properly checks SPY market conditions
 */

import { chromium } from "playwright";
import { createTask, addComment, getProjects } from "./src/nozbe-helper.js";
import { writeFileSync } from "fs";
import { join } from "path";

// OVTLYR Credentials
const OVTLYR_EMAIL = "ovtlyr.reimburse449@passmail.net";
const OVTLYR_PASSWORD = "Extinct8-Hypnosis7-Clatter5-Stubbly7-Venture5";

// File paths
const SCRIPT_DIR = "/Users/german/seconbrain";
const ANALYSIS_FILE = join(SCRIPT_DIR, "PLAN_M_ANALISIS_FINAL.txt");

// ============================================================
// OVTLYR EXTRACTION
// ============================================================

interface SPYData {
  fngHeatmap: number; // SPY F&G Heatmap value
  fngRising: boolean;
  buySignal: boolean;
  bullishTrend: boolean; // 10/20/50
  breadthBullish: boolean; // Full Stocks Breadth
}

interface SectorData {
  name: string;
  oc: number;
  percentage: number;
  change: string;
  status: string;
}

interface OVTLYRData {
  spy: SPYData;
  fullStocksOC: number;
  fullStocksPct: number;
  sectors: SectorData[];
  timestamp: string;
}

async function extractOVTLYRData(): Promise<OVTLYRData> {
  console.log("🌐 Connecting to OVTLYR...");

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    const page = await context.newPage();

    // Login
    console.log("🔑 Logging in...");
    await page.goto('https://console.ovtlyr.com/login', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await page.fill('#userLogin_keyword', OVTLYR_EMAIL);
    await page.fill('#txt_pwd', OVTLYR_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(6000);

    if (page.url().includes('login')) {
      throw new Error("Login failed");
    }

    console.log("✅ Logged in successfully");

    // Navigate to Market Breadth - Summary tab
    console.log("📊 Fetching Market Breadth (Summary tab)...");
    await page.goto('https://console.ovtlyr.com/market-breadth', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Click on Summary tab
    console.log("📋 Switching to Summary tab...");
    try {
      await page.click('text=Summary', { timeout: 5000 });
      await page.waitForTimeout(3000);
    } catch (e) {
      console.log("⚠️  Could not find Summary tab, using current view");
    }

    // Extract data from both text and HTML
    const text = await page.evaluate(() => document.body.innerText);
    const html = await page.evaluate(() => document.body.innerHTML);

    // Debug: save raw HTML and text for inspection
    writeFileSync(join(SCRIPT_DIR, 'ovtlyr_summary_debug.html'), html, 'utf-8');
    writeFileSync(join(SCRIPT_DIR, 'ovtlyr_summary_debug.txt'), text, 'utf-8');
    console.log("🔍 Debug files saved to:", join(SCRIPT_DIR, 'ovtlyr_summary_debug.*'));

    // Parse SPY data
    const spy: SPYData = {
      fngHeatmap: -1,
      fngRising: false,
      buySignal: false,
      bullishTrend: false,
      breadthBullish: false
    };

    // Search for SPY F&G Heatmap in Summary tab
    // The F&G value appears in the table with red_txt (descending) or green_txt (ascending)
    let heatmapFound = false;

    // Pattern: Find SPY section and extract F&G value with its color class
    // red_txt = Moving Down (descending), green_txt = Moving Up (ascending)
    const spyHeatmapHtmlPattern = /SPY.*?<p class="(red|green)_txt">(-?\d+\.?\d*)<\/p>/s;
    const spyHeatmapMatch = html.match(spyHeatmapHtmlPattern);

    if (spyHeatmapMatch && spyHeatmapMatch[2]) {
      spy.fngHeatmap = parseFloat(spyHeatmapMatch[2]);
      const colorClass = spyHeatmapMatch[1]; // "red" or "green"
      spy.fngRising = (colorClass === 'green'); // green = rising, red = falling
      console.log(`✅ Found SPY F&G Heatmap: ${spy.fngHeatmap} (${colorClass}_txt = ${spy.fngRising ? 'ascending' : 'descending'})`);
      heatmapFound = true;
    }

    // Fallback: Try to find decimal value in text
    if (!heatmapFound) {
      const spyTablePattern = /SPY\s+(Bearish|Bullish)?\s+(Sell|Buy)?\s+[\d.]+%.*?\s+-?\d+\s+-?\d+\s+(-?\d+\.?\d*)/s;
      const spyMatch = text.match(spyTablePattern);

      if (spyMatch && spyMatch[3]) {
        spy.fngHeatmap = parseFloat(spyMatch[3]);
        console.log(`✅ Found SPY F&G Heatmap: ${spy.fngHeatmap} (from SPY table row - could not determine direction)`);
        heatmapFound = true;
      }
    }

    // Note: spy.fngRising is already set above based on red_txt (falling) or green_txt (rising)

    // Check for SPY Buy Signal from Summary table
    // Pattern: SPY followed by (Bearish|Bullish) then (Sell|Buy)
    const spySignalPattern = /SPY\s+(?:Bearish|Bullish)\s+(Sell|Buy)/s;
    const spySignalMatch = text.match(spySignalPattern);

    if (spySignalMatch && spySignalMatch[1] === 'Buy') {
      spy.buySignal = true;
      console.log(`✅ SPY Signal: Buy (BUY SIGNAL active)`);
    } else {
      spy.buySignal = false;
      console.log(`❌ SPY Signal: ${spySignalMatch ? spySignalMatch[1] : 'Unknown'} - NOT Buy`);
    }

    // Check for SPY Bullish Trend
    // From Summary tab: Look for SPY Trend value
    // Bullish Trend = MM10 > MM20 AND Price > MM50
    const spyTrendPattern = /SPY\s+(Bearish|Bullish)/s;
    const spyTrendMatch = text.match(spyTrendPattern);

    if (spyTrendMatch && spyTrendMatch[1] === 'Bullish') {
      spy.bullishTrend = true;
      console.log(`✅ SPY Trend: Bullish (MM10 > MM20 and Price > MM50)`);
    } else {
      spy.bullishTrend = false;
      console.log(`❌ SPY Trend: ${spyTrendMatch ? spyTrendMatch[1] : 'Unknown'} - NOT Bullish`);
    }

    // Check Full Stocks Breadth
    spy.breadthBullish = text.includes('FULL STOCKS BREADTH') &&
                        (text.includes('BULLISH CROSS') || text.includes('BULLISH'));

    // Extract Full Stocks OC
    const fullStocksMatch = text.match(/FULL STOCKS.*?OC\s*:\s*(-?\d+)/s);
    const fullStocksOC = fullStocksMatch ? parseInt(fullStocksMatch[1]) : 0;

    const fullStocksPctMatch = text.match(/FULL STOCKS.*?(\d+\.\d+)%/s);
    const fullStocksPct = fullStocksPctMatch ? parseFloat(fullStocksPctMatch[1]) : 0;

    // Parse sectors
    const sectors: SectorData[] = [];
    const sectorPattern = /([A-Za-z\s]+)\s+OC\s*:\s*(-?\d+)\s*(\d+\.\d+)%?\s*([+-]\d+\.\d+%)?/g;
    let match;

    while ((match = sectorPattern.exec(text)) !== null) {
      const [, name, oc, percentage, change] = match;

      // Skip if not a real sector
      if (name.includes('FULL') || name.includes('S&P') || name.includes('DJIA')) {
        continue;
      }

      sectors.push({
        name: name.trim(),
        oc: parseInt(oc),
        percentage: parseFloat(percentage),
        change: change || 'N/A',
        status: parseInt(oc) >= 1 ? 'BULLISH' : parseInt(oc) < 0 ? 'BEARISH' : 'NEUTRAL'
      });
    }

    await browser.close();

    return {
      spy,
      fullStocksOC,
      fullStocksPct,
      sectors,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    await browser.close();
    throw error;
  }
}

// ============================================================
// PLAN M ANALYSIS (CORRECTED)
// ============================================================

function analyzePlanM(data: OVTLYRData): string {
  console.log("\n📈 Analyzing according to Plan M...");

  const lines: string[] = [];

  lines.push(`📊 ANÁLISIS PLAN M OVTLYR - ${new Date().toLocaleDateString('es-ES')}`);
  lines.push(`📅 ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
  lines.push("");

  // Check MARKET conditions (40%)
  lines.push("─────────────────────────────────────────");
  lines.push("📊 CONDICIONES DE MERCADO (40% del movimiento)");
  lines.push("─────────────────────────────────────────");

  const marketConditions: string[] = [];
  let marketMeetsCriteria = true;

  // 1. SPY F&G Heatmap < 70 y Rising
  if (data.spy.fngHeatmap !== -1) {
    if (data.spy.fngHeatmap < 70 && data.spy.fngRising) {
      marketConditions.push(`✅ SPY F&G Heatmap: ${data.spy.fngHeatmap} (< 70 y subiendo)`);
    } else {
      marketConditions.push(`❌ SPY F&G Heatmap: ${data.spy.fngHeatmap} ${data.spy.fngRising ? '(subiendo)' : '(bajando)'}`);
      marketMeetsCriteria = false;
    }
  } else {
    marketConditions.push("⚠️  SPY F&G Heatmap: No disponible");
    marketMeetsCriteria = false;
  }

  // 2. SPY BUY SIGNAL
  if (data.spy.buySignal) {
    marketConditions.push("✅ SPY BUY SIGNAL: Activo");
  } else {
    marketConditions.push("❌ SPY BUY SIGNAL: Inactivo");
    marketMeetsCriteria = false;
  }

  // 3. SPY BULLISH TREND 10/20/50
  if (data.spy.bullishTrend) {
    marketConditions.push("✅ SPY BULLISH TREND: 10/20/50");
  } else {
    marketConditions.push("❌ SPY BULLISH TREND: No confirmado");
    marketMeetsCriteria = false;
  }

  // 4. FULL STOCKS BREADTH Bullish Cross 10 EMA
  if (data.spy.breadthBullish) {
    marketConditions.push("✅ FULL STOCKS BREADTH: Cruce alcista EMA 10");
  } else {
    marketConditions.push("❌ FULL STOCKS BREADTH: Sin cruce alcista");
    marketMeetsCriteria = false;
  }

  // 5. OVTLYR CHANNEL Market
  if (data.fullStocksOC >= 1) {
    marketConditions.push(`✅ OVTLYR CHANNEL Market: OC = ${data.fullStocksOC}`);
  } else if (data.fullStocksOC === 0) {
    marketConditions.push(`⚠️  OVTLYR CHANNEL Market: OC = ${data.fullStocksOC} (Neutral)`);
    marketMeetsCriteria = false;
  } else {
    marketConditions.push(`❌ OVTLYR CHANNEL Market: OC = ${data.fullStocksOC} (Bajista)`);
    marketMeetsCriteria = false;
  }

  for (const condition of marketConditions) {
    lines.push(condition);
  }

  lines.push("");

  // Market conclusion
  lines.push("─────────────────────────────────────────");
  if (marketMeetsCriteria) {
    lines.push("✅ MERCADO CUMPLE PLAN M");
    lines.push("   Las condiciones de SPY y OVTLYR CHANNEL están alineados");
  } else {
    lines.push("❌ MERCADO NO CUMPLE PLAN M");
    lines.push("   Una o más condiciones de SPY no se cumplen");
  }
  lines.push("");

  // Analyze sectors (30%)
  lines.push("─────────────────────────────────────────");
  lines.push("📋 ANÁLISIS DE SECTORES (30% del movimiento)");
  lines.push("─────────────────────────────────────────");

  const candidates: SectorData[] = [];
  const excluded: SectorData[] = [];
  const notMet: SectorData[] = [];

  for (const sector of data.sectors) {
    if (sector.name.toLowerCase().includes('health') || sector.name.toLowerCase().includes('care')) {
      excluded.push(sector);
    } else if (sector.oc >= 1) {
      candidates.push(sector);
    } else {
      notMet.push(sector);
    }
  }

  // Candidates
  if (candidates.length > 0) {
    lines.push("✅ CANDIDATOS REQUIEREN VERIFICACIÓN:");
    lines.push("   (Market debe cumplir para ser válidos)");
    for (const sector of candidates) {
      lines.push(`⭐ ${sector.name.toUpperCase()}`);
      lines.push(`   OC=${sector.oc}, ${sector.percentage}% bullish, ${sector.change}`);
    }
    lines.push("");
  }

  // Excluded
  if (excluded.length > 0) {
    lines.push("❌ EXCLUIDOS:");
    for (const sector of excluded) {
      lines.push(`❌ ${sector.name.toUpperCase()} - PERMANENTEMENTE EXCLUIDO (Healthcare)`);
    }
    lines.push("");
  }

  // Not meeting criteria
  if (notMet.length > 0) {
    lines.push("⚠️  NO CUMPLEN CRITERIOS (OC < 1):");
    for (const sector of notMet) {
      lines.push(`⚠️  ${sector.name} (OC: ${sector.oc})`);
    }
    lines.push("");
  }

  // Recommendations
  lines.push("─────────────────────────────────────────");
  lines.push("📋 ACCIONES RECOMENDADAS");
  lines.push("─────────────────────────────────────────");

  if (marketMeetsCriteria && candidates.length > 0) {
    lines.push("✅ VERIFICAR SECTORES CANDIDATOS:");
    for (const sector of candidates) {
      lines.push(`   • ${sector.name}:`);
      lines.push(`     - Relative Greed: Sector > Market`);
      lines.push(`     - F&G Heatmap: < 70 y subiendo`);
      lines.push(`     - Breadth: Cruce EMA 10 alcista`);
    }
  } else if (!marketMeetsCriteria) {
    lines.push("⚠️  MONITOREAR HASTA QUE MERCADO CUMPLA:");
    lines.push("   - SPY F&G < 70 y subiendo");
    lines.push("   - SPY con Buy Signal activo");
    lines.push("   - SPY en tendencia 10/20/50");
    lines.push("   - Breadth con cruce EMA 10");
    lines.push("");
    lines.push(`   OVTLYR CHANNEL Market actual: OC = ${data.fullStocksOC}`);
    lines.push("   (Necesita OC = 1 o 2 para M1S1 o M2)");
  }

  lines.push("");
  lines.push("─────────────────────────────────────────");
  lines.push("📁 ARCHIVOS");
  lines.push("─────────────────────────────────────────");
  lines.push(`• Plan M completo: ${join(SCRIPT_DIR, 'PLAN_M_REGLES.md')}`);
  lines.push(`• Análisis: ${ANALYSIS_FILE}`);

  return lines.join("\n");
}

// ============================================================
// NOZBE INTEGRATION
// ============================================================

async function saveToNozbe(analysis: string): Promise<void> {
  console.log("\n💾 Saving to Nozbe...");

  // Get projects
  const projects = await getProjects();
  const targetProject = projects.find(p => p.is_single_actions) || projects[0];

  if (!targetProject) {
    throw new Error("No projects found");
  }

  const dateStr = new Date().toLocaleDateString('es-ES');

  // Create task
  const task = await createTask({
    name: `📊 Plan M OVTLYR - ${dateStr} - SPY Check`,
    projectId: targetProject.id,
    priority: 1,
  });

  console.log(`✓ Task created: ${task.id}`);

  // Add analysis as comment
  await addComment(task.id, analysis);

  console.log("✓ Analysis added as comment");
  console.log(`\n📱 Available in Nozbe app - Task ID: ${task.id}`);
}

// ============================================================
// MAIN FUNCTION
// ============================================================

async function main() {
  const startTime = Date.now();
  console.log("=".repeat(60));
  console.log("🎯 AUTOMATED PLAN M ANALYSIS (CORRECTED VERSION)");
  console.log("=".repeat(60));
  console.log(`⏰ Started: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);

  try {
    // Extract data from OVTLYR
    const data = await extractOVTLYRData();

    console.log(`✅ Data extracted successfully`);
    console.log(`   - SPY F&G: ${data.spy.fngHeatmap} ${data.spy.fngRising ? '(subiendo)' : '(bajando)'}`);
    console.log(`   - SPY Buy Signal: ${data.spy.buySignal ? '✅' : '❌'}`);
    console.log(`   - SPY Bullish: ${data.spy.bullishTrend ? '✅' : '❌'}`);
    console.log(`   - Full Stocks OC: ${data.fullStocksOC}`);
    console.log(`   - Sectors found: ${data.sectors.length}`);

    // Analyze according to Plan M
    const analysis = analyzePlanM(data);

    // Save analysis to file
    writeFileSync(ANALYSIS_FILE, analysis, 'utf-8');
    console.log(`\n💾 Analysis saved to: ${ANALYSIS_FILE}`);

    // Save to Nozbe
    await saveToNozbe(analysis);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n" + "=".repeat(60));
    console.log(`✅ COMPLETED in ${duration}s`);
    console.log("=".repeat(60));

  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    process.exit(1);
  }
}

main();
