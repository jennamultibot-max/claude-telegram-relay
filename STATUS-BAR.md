# Cloud Coach Status Bar

Una barra de estado global para rastrear tokens, modelo y uso de contexto en tu terminal.

## 🎯 Características

- **Rastreo de tokens** en tiempo real (input + output + total)
- **Modelo actual** con nombre legible (Opus, Sonnet, Haiku, GLM)
- **Porcentaje de contexto** usado del límite del modelo
- **Duración de la sesión** y número de requests
- **Costo estimado** basado en precios de la API
- **Actualización automática** en tu terminal

## 🚀 Uso Rápido

### Ver estado actual

```bash
bun run status
```

### Ver estado detallado

```bash
bun run status
```

### Reiniciar métricas de sesión

```bash
bun run status:reset
```

### Exportar como JSON

```bash
bun run status:json
```

### Demo de barra en terminal

```bash
bun run example:terminal-status
```

## 💻 Integración en tu Código

### 1. Barra de Terminal (Live Updates)

```typescript
import { TerminalStatusBar, getTerminalStatusBar } from "./src/status-terminal.ts";

// Inicializar
const statusBar = new TerminalStatusBar("claude-sonnet-4-6");
statusBar.start(); // Actualiza cada 1 segundo por defecto

// Rastrear actividad
statusBar.updateTokens(1500, 800);
statusBar.recordRequest();

// Ver estado detallado
statusBar.printDetailedStatus();

// Cambiar modelo
statusBar.setModel("claude-opus-4-6");

// Detener
statusBar.stop();
```

### 2. Usar Singleton Global

```typescript
import {
  startTerminalStatus,
  trackTerminalTokens,
  trackTerminalRequest,
  setTerminalModel,
  printTerminalStatus,
} from "./src/status-terminal.ts";

// Iniciar al principio de tu app
startTerminalStatus("claude-sonnet-4-6");

// Rastrear sin acceder a la instancia
trackTerminalTokens(1500, 800);
trackTerminalRequest();

// Cambiar modelo cuando sea necesario
setTerminalModel("claude-opus-4-6");

// Imprimir estado detallado
printTerminalStatus();
```

### 3. Barra Básica (Sin terminal)

```typescript
import { StatusBar, getStatusBar, trackTokens, trackRequest, printStatus } from "./src/status-bar.ts";

const statusBar = new StatusBar("claude-sonnet-4-6");
statusBar.start(1000); // Actualizar cada segundo

// O usar funciones de conveniencia
trackTokens(1500, 800);
trackRequest();

// Ver estado
printStatus();
```

## 🔧 Integración con el Relay

Agrega esto al principio de `src/relay.ts`:

```typescript
import { startTerminalStatus, trackTerminalTokens, trackTerminalRequest } from "./status-terminal.ts";

// Después de la configuración
startTerminalStatus("claude-sonnet-4-6");

// En callClaude(), después de obtener la respuesta
// Parsea los tokens del output y rastéalos:
const tokenMatch = output.match(/Input tokens: (\d+)/);
const outputTokenMatch = output.match(/Output tokens: (\d+)/);

if (tokenMatch && outputTokenMatch) {
  trackTerminalTokens(parseInt(tokenMatch[1]), parseInt(outputTokenMatch[1]));
  trackTerminalRequest();
}
```

## 📊 Modelos Soportados

| Modelo | Max Tokens | Input/1M | Output/1M |
|--------|------------|----------|-----------|
| Opus 4.6 | 200,000 | $15 | $75 |
| Sonnet 4.6 | 200,000 | $3 | $15 |
| Haiku 4.5 | 200,000 | $0.25 | $1.25 |
| GLM 4.7 | 200,000 | $1 | $2 |
| GLM 4.5 Air | 200,000 | $0.50 | $1 |

## 🎨 Formato de Salida

### Línea de Estado

```
━━━ 🤖 Sonnet 4.6 | 📊 5,300 tokens (2.7%) | ⏱️ 2m 15s | 💰 $0.0180 ━━━
```

### Estado Detallado

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CLOUD COACH STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Modelo:      Sonnet 4.6
📊 Tokens:      3,500 input + 1,800 output = 5,300 total
📏 Contexto:    2.7% / 100%
⏱️ Sesión:      2m 15s (3 requests)
💰 Costo est.:  $0.0180
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 🛠️ API Reference

### `TerminalStatusBar`

| Método | Parámetros | Descripción |
|--------|-----------|-------------|
| `start(intervalMs)` | `number` (default: 1000) | Inicia actualizaciones automáticas |
| `stop()` | - | Detiene la barra de estado |
| `updateTokens(input, output)` | `number, number` | Actualiza conteo de tokens |
| `recordRequest()` | - | Registra un nuevo request |
| `setModel(model)` | `string` | Cambia el modelo actual |
| `printDetailedStatus()` | - | Imprime estado detallado |

### Funciones Globales

| Función | Descripción |
|---------|-------------|
| `startTerminalStatus(model?)` | Inicia la barra global |
| `stopTerminalStatus()` | Detiene la barra global |
| `trackTerminalTokens(input, output)` | Rastrea tokens |
| `trackTerminalRequest()` | Registra request |
| `setTerminalModel(model)` | Cambia modelo |
| `printTerminalStatus()` | Imprime estado |

## 📝 Notas

- La barra de estado se limpia automáticamente al salir del programa
- Los colores ANSI funcionan en la mayoría de terminales modernas
- El costo es estimado y puede variar según el proveedor de la API
- Los límites de tokens son aproximados basados en documentación oficial
