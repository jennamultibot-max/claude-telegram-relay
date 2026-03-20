#!/bin/bash
# Configuración SIMPLE de prompt con indicador de Claude
# No requiere instalar nada adicional

# Añadir función simple a ~/.zshrc
cat >> ~/.zshrc << 'EOF'

# Indicador simple de Claude Code
# Agrega 🤖 cuando estás usando Claude Code
precmd() {
    if [ -n "$CLAUDECODE" ] || [ -n "$CLAUDE" ]; then
        echo -ne "\033[1;34m🤖 Claude Code \033[0m\n"
    fi
}
EOF

echo "✅ Indicador añadido a ~/.zshrc"
echo ""
echo "Recarga tu terminal:"
echo "  source ~/.zshrc"
echo ""
echo "Verás '🤖 Claude Code' cuando entres en Claude"
EOF
