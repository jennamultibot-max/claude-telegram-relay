#!/bin/bash
# Configurar prompt de zsh con indicador de Claude Code
# Añade un indicador visual cuando estás en Claude Code

# Detectar si estamos en Claude Code
check_claude() {
    if [ -n "$CLAUDECODE" ] || [ -n "$CLAUDE" ]; then
        echo "🤖"
    else
        echo ""
    fi
}

# Añadir función a ~/.zshrc
cat >> ~/.zshrc << 'EOF'

# Claude Code Indicator
check_claude() {
    if [ -n "$CLAUDECODE" ] || [ -n "$CLAUDE" ]; then
        echo "🤖"
    else
        echo ""
    fi
}

# Prompt modificado con indicador de Claude
setopt PROMPT_SUBST
PROMPT='$(check_claude) %n@%m %# '

EOF

echo "✅ Indicador de Claude Code añadido a ~/.zshrc"
echo ""
echo "Recarga tu terminal o ejecuta:"
echo "  source ~/.zshrc"
echo ""
echo "Verás 🤖 cuando estés en Claude Code"
EOF
