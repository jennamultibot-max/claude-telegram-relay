#!/bin/bash
# Claude Code Wrapper con Status Bar Simulado
# Ejecuta Claude y muestra un status bar persistente
# Uso: ./claude-wrapper.sh

# Iniciar Claude en background
claude "$@" &
CLAUDE_PID=$!

# Función para mostrar status bar simulado
show_status_bar() {
    while kill -0 $CLAUDE_PID 2>/dev/null; do
        # Leer contexto si está disponible
        # Nota: No podemos acceder al estado interno de Claude
        echo -ne "\r"
        echo -ne "━━━ 🤖 Context Monitor | Tokens: Activo | ⏱️ $(date +%H:%M:%S) ━━━"
        sleep 1
    done
    echo ""
}

# Iniciar monitor de status bar
show_status_bar &

# Esperar a Claude
wait $CLAUDE_PID

echo "Claude terminado"
