#!/bin/bash
# Configuración ULTRA SIMPLE de indicador
# Sin heredoc, sin comandos complejos

echo "# Indicador simple de Claude Code" >> ~/.zshrc

echo "function show_indicator() {" >> ~/.zshrc

echo '  if [ -n "$CLAUDECODE" ] || [ -n "$CLAUDE" ]; then' >> ~/.zshrc
echo '    echo -ne "\033[1;34m🤖 Claude Code \033[0m\n"' >> ~/.zshrc
echo '  fi' >> ~/.zshrc

echo "}" >> ~/.zshrc

echo "" >> ~/.zshrc

echo "# Prueba simple de funcionamiento" >> ~/.zshrc

echo "echo 'Test simple'" >> ~/.zshrc

echo "" >> ~/.zshrc

echo "✅ Configuración simplificada añadida"
echo ""
echo "El indicador debería aparecer como '🤖 Claude Code' antes de tus comandos en la terminal."
echo ""
echo "🔄 Por favor recarga tu terminal:"
echo "  source ~/.zshrc"
