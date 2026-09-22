import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config({ ignores: ["dist/**"] }, ...tseslint.configs.recommended, eslintConfigPrettier, {
	rules: {
		"@typescript-eslint/no-unused-vars": [
			"error",
			{
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				destructuredArrayIgnorePattern: "^_",
			},
		],
	},
});
