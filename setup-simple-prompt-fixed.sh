#!/bin/bash
# Configuración SIMPLE de prompt con indicador de Claude

echo '# Indicador simple de Claude Code' >> ~/.zshrc
echo 'precmd() {' >> ~/.zshrc
echo '    if [ -n "$CLAUDECODE" ] || [ -n "$CLAUDE" ]; then' >> ~/.zshrc
echo '        echo -ne "\033[1;34m🤖 Claude Code \033[0m\n"' >> ~/.zshrc
echo '    fi' >> ~/.zshrc
echo '}' >> ~/.zshrc
echo '' >> ~/.zshrc

echo "✅ Indicador añadido a ~/.zshrc"
echo ""
echo "Recarga tu terminal:"
echo "  source ~/.zshrc"
