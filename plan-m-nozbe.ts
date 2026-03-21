#!/usr/bin/env bun
/**
 * Create Plan M Analysis Task in Nozbe
 * Uses the working Nozbe API integration from claude-telegram-relay
 */

import { createTask, addComment, getProjects } from "./src/nozbe-helper.js";

// Analysis content
const analysis = `
📊 ANÁLISIS COMPLETO PLAN M - OVTLYR
═══════════════════════════════════════

📅 Fecha: 2026-03-21 08:00

─────────────────────────────────────────
✅ CANDIDATOS POTENCIALES PLAN M
─────────────────────────────────────────

🎯 ENERGY - Candidato más fuerte
   • OVTLYR Channel (OC): 1 ✅ (Cumple M1S1)
   • Bull List %: 43.83%
   • Cambio diario: +1.85%
   • Estado: BULLISH
   ✅ RECOMENDACIÓN: FUERTE CANDIDATO

🎯 TECHNOLOGY - Segundo candidato
   • OVTLYR Channel (OC): 1 ✅ (Cumple M1S1)
   • Bull List %: 17.10%
   • Cambio diario: +2.38%
   • Estado: BULLISH
   ✅ RECOMENDACIÓN: CANDIDATO

─────────────────────────────────────────
❌ SECTORES EXCLUIDOS (PLAN M)
─────────────────────────────────────────

❌ HEALTH CARE - PERMANENTEMENTE EXCLUIDO
   • OC: 0, 15.17%, -1.33%

─────────────────────────────────────────
📊 CONDICIONES DE MERCADO
─────────────────────────────────────────

🔴 ALERTA IMPORTANTE:
   • Full Stocks OC = 0 (Neutral)
   • S&P 500: WEAKENING BEAR
   • MERCADO NO CUMPLE CRITERIOS PLAN M AHORA

─────────────────────────────────────────
📋 ACCIONES RECOMENDADAS
─────────────────────────────────────────

1. MONITOREAR Full Stocks OC diariamente
2. Cuando OC Market = 2:
   ✓ Energy y Technology se vuelven válidos
3. Verificar: Relative Greed > 1, F&G < 70 y subiendo
4. Healthcare: NUNCA usar en Plan M

─────────────────────────────────────────
📁 ARCHIVOS
─────────────────────────────────────────

• Plan M completo: /Users/german/seconbrain/PLAN_M_REGLES.md
• Análisis detallado: /Users/german/seconbrain/PLAN_M_ANALISIS_FINAL.txt
• Screenshot: /tmp/ovtlyr_final_sectors.png
`;

async function main() {
  try {
    console.log("📊 Creating Plan M analysis task in Nozbe...\n");

    // Get projects to find the right one
    console.log("📁 Fetching projects...");
    const projects = await getProjects();

    // Find JennaMultibot project (or Single Actions as fallback)
    const targetProject = projects.find(p =>
      p.name.includes("Jenna") ||
      p.name.includes("Multibot") ||
      p.is_single_actions
    ) || projects[0]; // Fallback to first project

    if (!targetProject) {
      throw new Error("No projects found in Nozbe");
    }

    console.log(`✓ Using project: ${targetProject.name} (${targetProject.id})`);

    // Create the task
    console.log("\n📝 Creating task...");
    const task = await createTask({
      name: "📊 Plan M OVTLYR - Análisis Sectores 2026-03-21",
      projectId: targetProject.id,
      priority: 1, // High priority
    });

    console.log(`✓ Task created successfully!`);
    console.log(`  ID: ${task.id}`);
    console.log(`  Name: ${task.name}`);
    console.log(`  Project: ${targetProject.name}`);

    // Add the analysis as a comment
    console.log("\n💬 Adding analysis as comment...");
    await addComment(task.id, analysis.trim());

    console.log("✓ Comment added successfully!");
    console.log("\n" + "=".repeat(60));
    console.log("✅ PLAN M ANALYSIS SAVED TO NOZBE");
    console.log("=".repeat(60));
    console.log(`\n📱 Check your Nozbe app now!`);
    console.log(`   Task ID: ${task.id}`);
    console.log(`   You should see it in: ${targetProject.name}\n`);

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\n💡 Alternative: The analysis is available at:");
    console.error("   /Users/german/seconbrain/PLAN_M_ANALISIS_FINAL.txt\n");
    process.exit(1);
  }
}

main();
