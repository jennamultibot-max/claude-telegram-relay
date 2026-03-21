# Plan M OVTLYR - Análisis de Costes

## Ejecución: Lunes a Viernes a las 2:00 PM (sin sábados ni domingos)

### 💰 Coste MONETARIO: 0€

**Por qué es GRATIS:**
- ✅ Corre localmente en tu ordenador
- ✅ OVTLYR: Web scraping con credenciales existentes (sin API)
- ✅ Nozbe: API REST gratuita (incluido en tu suscripción)
- ✅ Sin servicios cloud pagos (AWS, Google Cloud, etc.)

### 🔧 Recursos Técnicos por Ejecución

| Recurso | Uso |
|---------|-----|
| **Tiempo** | ~20-25 segundos |
| **CPU** | Chromium headless (Playwright) |
| **RAM** | ~200-300 MB |
| **Red** | ~2-3 MB (OVTLYR + Nozbe) |
| **Disco** | ~10 KB (archivos de log/análisis) |

### ⚡ Coste Energético (electricidad)

**Cálculo semanal:**
```
Ejecuciones: 5 días/semana × 20 segundos = 100 segundos/semana
Potencia MacBook Pro: ~30W (en uso activo)
Energía: 100s × 30W = 3,000 Ws = 0.003 kWh/semana

Coste electricidad España: ~0.21€/kWh
Coste semanal: 0.003 kWh × 0.21€ = 0.00063€/semana
Coste anual: 0.00063€ × 52 semanas = 0.033€/año
```

**Coste aproximado:** **0.03€ por AÑO** (tres céntimos de euro)

### 📊 Resumen

| Concepto | Coste |
|----------|-------|
| Monetario | 0€ |
| Eléctrico | 0.03€/año |
| **TOTAL** | **~0€ (despreciable)** |

### 🎯 Conclusión

El sistema tiene un **coste prácticamente nulo**. El único "coste" es:
- 100 segundos de CPU por semana (20s × 5 días)
- Energía equivalente a dejar una bombilla LED encendida 1 minuto

---

**Nota:** Si el mercado abre algún sábado o mañana (raro), puedes ejecutar manualmente:
```bash
cd /Users/german/seconbrain/claude-telegram-relay
bun run automated-plan-m.ts
```
