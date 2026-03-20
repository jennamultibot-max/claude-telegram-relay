# Status Bar Siempre Visible en Terminal

Guía para tener una barra de estado siempre visible mientras usas Claude Code.

## 🎯 Método 1: TMUX (Recomendado)

**Ventajas:**
- ✅ Status bar siempre visible en la parte inferior
- ✅ Múltiples paneles/sesiones
- ✅ Persistente incluso si cierras la terminal
- ✅ No afecta a Claude Code

**Configuración rápida:**
```bash
# Ejecutar el script de configuración
bun run setup:tmux-statusbar

# Iniciar Claude en tmux
tmux new -s claude 'claude'
```

**Lo que verás:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Claude Code ● | Contexto: Activo              13:06:35 | german              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Comandos de tmux:**
- `Ctrl+B` + `c` - Nueva ventana
- `Ctrl+B` + `n` - Ventana siguiente
- `Ctrl+B` + `p` - Ventana anterior
- `Ctrl+B` + `d` - Detach (volver a terminal normal)

## 🎯 Método 2: Shell Prompt Personalizado

**Opciones de prompts con status integrado:**

### Starship (Moderno y customizable)
```bash
# Instalar
brew install starship

# Configurar
mkdir -p ~/.config
cat > ~/.config/starship.toml << 'EOF'
[context]
format = "🤖 [$symbol]($style) [$context]($style) "
symbol = "claude"
style = "bold blue"
context = "green"

[context]
detect_env_vars = ["CLAUDE"]
default = "offline"
```

# Añadir a ~/.zshrc
echo 'eval "$(starship init zsh)"' >> ~/.zshrc
```

### Powerline
```bash
# Instalar
brew install python3
pip3 install powerline

# Activar en ~/.zshrc
echo '. /usr/local/lib/python3.9/site-packages/powerline/bindings/zsh/powerline.zsh' >> ~/.zshrc
```

## 🎯 Método 3: Script wrapper con status

**Ejecuta Claude + muestra status externo:**

```bash
# Usar el wrapper
./claude-wrapper.sh

# Status bar se muestra en paralelo
```

## 🎯 Método 4: iTerm2 (Si usas iTerm)

**iTerm2 tiene integración nativa de status bar:**

1. Preferences → Profiles → Session
2. Marca "Status bar enabled"
3. Configura el componente de status:
   - Time
   - User
   - Path

## 📊 Comparación de métodos

| Método | Dificultad | Efecto | Persistencia |
|--------|-------------|----------|--------------|
| TMUX | ⭐⭐ Media | ⭐⭐⭐⭐ Excelente | ⭐⭐⭐ Excelente |
| Starship | ⭐⭐ Media | ⭐⭐⭐ Muy buena | ⭐⭐⭐ Excelente |
| Powerline | ⭐⭐⭐ Difícil | ⭐⭐ Muy buena | ⭐⭐⭐ Excelente |
| Wrapper script | ⭐ Fácil | ⭐ Regular | ⭐ Regular |
| iTerm2 | ⭐ Fácil | ⭐⭐ Buena | ⭐⭐ Buena |

## 🚀 Recomendación

**Para la mejor experiencia:**

1. **Usa TMUX** con el script provisto
2. **Personaliza** el status bar editando `~/.tmux.conf`
3. **Inicia Claude** dentro de tmux: `tmux new -s claude 'claude'`

## ⚠️ Limitación importante

**Claude Code CLI no soporta:**
- ❌ Plugins nativos
- ❌ Hooks de UI
- ❌ Configuración de status bar externo
- ❌ Modificar su renderizado interno

La única forma de tener status SIEMPRE visible es usar **herramientas externas** como tmux, prompts personalizados, o wrappers.

## 💡 Tip: Usar tmux sessions nombradas

```bash
# Crear session específica para Claude
tmux new -s claude 'claude'

# Listar sessions
tmux ls

# Re-attach a session existente
tmux attach -t claude

# Matar session
tmux kill-session -t claude
```

## 🎯 Qué muestra el status bar de tmux

El script configura una status bar que muestra:
- **🤖 Claude Code** - Indica que estás en Claude
- **●** - Estado (●=activo, ○=detach)
- **Contexto: Activo** - Estado del contexto
- **13:06:35** - Hora actual
- **german** - Usuario

La status bar se actualiza cada 1 segundo y siempre está visible.
