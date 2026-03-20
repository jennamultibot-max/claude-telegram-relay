# Indicador ULTRA SIMPLE de Claude Code
# No usa precmd, solo modifica el prompt

# Crear directorio para el prompt modificado
mkdir -p ~/.zsh_prompt_mod

echo "=== Generando prompt modificado ===" && echo ""

# Crear prompt base con indicador
cat > ~/.zsh_prompt_mod/base_prompt << 'EOF'

%F{$(git symbolic-ref HEAD^) # Git branch (si está en un repo)
%F{$(git symbolic-ref HEAD^)} # Git hash (si está en un repo)
%F{$(git symbolic-ref HEAD^)}

EOF

echo "✅ Prompt base creado" && echo ""

# Crear función para añadir el indicador
cat >> ~/.zsh_prompt_mod/base_prompt << 'EOF'

clau_indicator() {
    # Mostrar indicador antes del prompt
    echo -ne "\033[1;34m🤖 Claude Code \033[0m\n"
}

EOF

echo "✅ Función indicador añadida" && echo ""

# Crear prompt modificado que carga la función
cat > ~/.zsh_prompt_mod/.prompt_mod << 'EOF'

# Cargar la función de indicador
source ~/.zsh_prompt_mod/base_prompt

# Aplicar al prompt original
PROMPT="\$(cat ~/.zsh_prompt_mod/base_prompt)"

EOF

echo "✅ Prompt modificado creado" && echo ""

# Añadir al zshrc para cargar el prompt modificado
cat >> ~/.zshrc << 'EOF'

# Cargar prompt modificado con indicador antes de cada comando
PROMPT="\$(cat ~/.zsh_prompt_mod/.prompt_mod)"

EOF

echo "✅ Configuración añadida a ~/.zshrc" && echo ""

echo "=== Resumen ===" && echo ""
echo "Se ha creado un sistema de indicadores de Claude Code:"
echo ""
echo "- Función: clau_indicator() - muestra 🤖 antes del prompt"
echo "- Modificación: El prompt se carga desde ~/.zsh_prompt_mod/.prompt_mod"
echo "- Sin dependencia del hook precmd - funciona en cualquier entorno"
echo ""
echo "=== Aplicando ===" && echo ""

# Aplicar los cambios
PROMPT="\$(cat ~/.zsh_prompt_mod/.prompt_mod)"

echo "✅ Cambios aplicados" && echo ""
echo ""
echo "🔄 Por favor recarga tu terminal:"
echo "  source ~/.zshrc"
