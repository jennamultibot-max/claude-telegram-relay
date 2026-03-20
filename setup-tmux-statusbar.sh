#!/bin/bash
# Configurar tmux con status bar para Claude Code
# Ejecuta este script antes de iniciar Claude

# Instalar tmux si no está
if ! command -v tmux &> /dev/null; then
    echo "Instalando tmux..."
    brew install tmux
fi

# Crear configuración de tmux con status bar
TMUX_CONF="$HOME/.tmux.conf"

cat > "$TMUX_CONF" << 'EOF'
# Status bar siempre visible en la parte inferior
set -g status on
set -g status-interval 1
set -g status-justify centre
set -g status-left-length 100
set -g status-right-length 100

# Izquierda: contexto de Claude (simulado)
set -g status-left '#[bg=blue]🤖 #[fg=white]Claude Code #[fg=green]●#[fg=white] | #[fg=cyan]Contexto: #[fg=yellow]Activo '

# Centro: tiempo
set -g status-left '#[fg=white]%H:%M:%S'

# Derecha: info de sistema
set -g status-right '#[fg=green]●#[fg=white] #[fg=cyan]%H:%M #[fg=white]| #[fg=magenta]#(whoami) '

# Colores de la barra
set -g status-bg black
set -g status-fg white

# Colores de ventana activa/inactiva
set -g window-status-current-style 'bg=green fg=white bold'
set -g window-status-activity-style 'fg=yellow'
set -g window-status-bell-style 'fg=red'
EOF

echo "✅ Configuración de tmux creada"
echo ""
echo "Para usar:"
echo "  tmux new -s claude 'claude'"
echo ""
echo "La status bar estará SIEMPRE visible en la parte inferior"
EOF
