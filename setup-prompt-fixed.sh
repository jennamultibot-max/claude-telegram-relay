#!/bin/bash
# Configuración FIXED de prompt con indicador de Claude Code
# Cambia el nombre de la función para evitar conflicto con builtin de zsh

# Añadir función con nombre diferente para evitar conflicto
cat > ~/.zshrc << 'EOF'

# Indicador simple de Claude Code
# Agrega 🤖 cuando estás usando Claude Code
# Nombre de función cambiado a claudef_preexec para evitar conflicto
claudef_preexec() {
    if [ -n "$CLAUDECODE" ] || [ -n "$CLAUDE" ]; then
        echo -ne "\033[1;34m🤖 Claude Code \033[0m\n"
    fi
}
EOF

echo "✅ Indicador añadido a ~/.zshrc"
echo ""
echo "El indicador ahora debería funcionar correctamente"
echo ""
echo "Recarga tu terminal:"
echo "  source ~/.zshrc"
echo ""
echo "O ejecuta:"
echo "  echo 'Hola Mundo'"
echo "Verás 🤖 Claude Code antes del comando"
EOF
