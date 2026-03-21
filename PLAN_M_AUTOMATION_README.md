# Plan M OVTLYR - Sistema Automatizado

## Descripción

Sistema automatizado de análisis diario del Plan M de trading usando datos de OVTLYR Market Breadth.

## Horario de Ejecución

**Programado:** Todos los días a las **2:00 PM (hora española)**

**Si el ordenador está apagado a las 2:00 PM:**
- El script se ejecutará automáticamente al encender el ordenador
- Sistema de prevención de duplicados evita múltiples ejecuciones el mismo día

## Archivos

### Scripts
- `automated-plan-m.ts` - Script principal de automatización
- `plan-m-nozbe.ts` - Script de prueba manual

### Configuración
- `~/Library/LaunchAgents/com.claude.plan-m-analysis.plist` - Servicio launchd

### Archivos de datos
- `/Users/german/seconbrain/PLAN_M_ANALISIS_FINAL.txt` - Análisis del día
- `/Users/german/seconbrain/claude-telegram-relay/.plan_m_last_run.txt` - Timestamp de última ejecución
- `logs/com.claude.plan-m-analysis.log` - Log de ejecución
- `logs/com.claude.plan-m-analysis.error.log` - Log de errores

## Funcionamiento

### 1. Extracción de Datos
- Accede a OVTLYR (console.ovtlyr.com) usando Playwright
- Navega a pestaña "Summary" de Market Breadth
- Extrae datos de SPY y sectores

### 2. Validación SPY (Mercado - 40%)
- ✅ **SPY F&G Heatmap**: Debe ser < 70 y ascendente
- ✅ **SPY BUY SIGNAL**: Debe estar activo
- ✅ **SPY BULLISH TREND**: MM10 > MM20 y Precio > MM50
- ✅ **FULL STOCKS BREADTH**: Cruce alcista EMA 10
- ✅ **OVTLYR CHANNEL Market**: OC = 1 o 2

### 3. Análisis de Sectores (30%)
- Busca sectores con OC ≥ 1
- **Healthcare**: PERMANENTEMENTE EXCLUIDO
- Clasifica: Candidatos, Excluidos, No cumplen criterios

### 4. Resultados
- Guarda análisis en archivo de texto
- Crea tarea en Nozbe con análisis completo en comentarios

## Gestión del Servicio

### Ver estado del servicio
```bash
launchctl list | grep com.claude.plan-m-analysis
```

### Ver logs
```bash
tail -f logs/com.claude.plan-m-analysis.log
```

### Reiniciar servicio
```bash
launchctl unload ~/Library/LaunchAgents/com.claude.plan-m-analysis.plist
launchctl load ~/Library/LaunchAgents/com.claude.plan-m-analysis.plist
```

### Ejecutar manualmente
```bash
cd /Users/german/seconbrain/claude-telegram-relay
bun run automated-plan-m.ts
```

## Prevención de Ejecuciones Duplicadas

El sistema usa un archivo de timestamp (`.plan_m_last_run.txt`) para evitar ejecuciones múltiples el mismo día:

**Escenarios:**
1. **Ejecución normal a las 2:00 PM**: Ejecuta ✓, marca timestamp
2. **Ordenador apagado a las 2:00 PM**: Ejecuta al encender ✓ (si no se ejecutó hoy)
3. **Ejecución manual después de 2:00 PM**: Detecta que ya corrió hoy, salta ✓
4. **Reinicio del ordenador**: Solo ejecuta si no corrió hoy ✓

## Actualización

Para actualizar el sistema:
```bash
cd /Users/german/seconbrain/claude-telegram-relay
# Editar archivos
git add .
git commit -m "descripción de cambios"
git push origin master
launchctl unload ~/Library/LaunchAgents/com.claude.plan-m-analysis.plist
launchctl load ~/Library/LaunchAgents/com.claude.plan-m-analysis.plist
```

## Referencias

- Plan M completo: `/Users/german/seconbrain/PLAN_M_REGLES.md`
- Repositorio: `github.com:jennamultibot-max/claude-telegram-relay`
