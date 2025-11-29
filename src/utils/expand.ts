/**
 * Expands variables in a secrets map.
 * Supports ${VAR} syntax.
 * Prevents infinite recursion.
 */
export function expandSecrets(secrets: Record<string, string>): Record<string, string> {
    const expanded: Record<string, string> = { ...secrets };
    const MAX_DEPTH = 5; // Prevent infinite loops

    for (const key of Object.keys(expanded)) {
        let value = expanded[key];
        let depth = 0;

        // Regex to find ${VAR}
        const varRegex = /\$\{([a-zA-Z0-9_]+)\}/g;

        while (varRegex.test(value) && depth < MAX_DEPTH) {
            value = value.replace(varRegex, (match, varName) => {
                // If variable exists in secrets, use it. Otherwise keep original.
                return expanded[varName] !== undefined ? expanded[varName] : match;
            });
            depth++;
        }

        expanded[key] = value;
    }

    return expanded;
}
