// Enregistre le résolveur d'alias avant le chargement des tests.
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
