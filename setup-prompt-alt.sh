#!/bin/bash
# Configuración SIMPLE de prompt con indicador de Claude Code
# Sin heredoc para evitar errores

# Borrar configuración anterior
rm -f ~/.zshrc.claude-indicator 2>/dev/null || true

# Añadir la función directamente con echo
echo "# Indicador simple de Claude Code" > ~/.zshrc.claude-indicator
echo "" >> ~/.zshrc.claude-indicator
echo "claudef_preexec() {" >> ~/.zshrc.claude-indicator
echo "    if [ -n \"\$CLAUDECODE\" ] || [ -n \"\$CLAUDE\" ]; then" >> ~/.zshrc.claude-indicator
echo "        echo -ne '\033[1;34m🤖 Claude Code \033[0m\n'" >> ~/.zshrc.claude-indicator
echo "    fi" >> ~/.zshrc.claude-indicator
echo "}" >> ~/.zshrc.claude-indicator
echo "" >> ~/.zshrc.claude-indicator
echo "✅ Indicador añadido" >> ~/.zshrc.claude-indicator
echo "" >> ~/.zshrc.claude-indicator
echo "El indicador ahora debería funcionar" >> ~/.zshrc.claude-indicator

echo "🔄 Por favor recarga tu terminal:"
echo "  source ~/.zshrc" >> ~/.zshrc.claude-indicator
echo "" >> ~/.zshrc.claude-indicator
echo "🧪 El indicador de Claude Code debería aparecer antes de tus comandos" >> ~/.zshrc.claude-indicator

echo "📱 Comandos de prueba:" >> ~/.zshrc.claude-indicator
echo "  1. Ver si la función existe:" >> ~/.zshrc.claude-indicator
echo "     typeset -f claudef_preexec 2>&1 | head -3" >> ~/.zshrc.claude-indicator
echo "  2. Ejecutar un comando simple:" >> ~/.zshrc.claude-indicator
echo "     echo 'Hola Mundo'" >> ~/.zshrc.claude-indicator
echo "  3. Verificar configuración:" >> ~/.zshrc.claude-indicator
echo "     cat ~/.zshrc.claude-indicator" >> ~/.zshrc.claude-indicator
EOF

echo "✅ Nuevo indicador añadido"
echo ""
echo "Recarga tu terminal:"
echo "  source ~/.zshrc"
echo ""
echo "O prueba:"
echo "  echo 'test'"
echo "Verás 🤖 Claude Code antes del comando"
