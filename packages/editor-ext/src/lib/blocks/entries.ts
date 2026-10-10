/**
 * Side-effect entry point for first-party schema block modules.
 *
 * Import schema block files here so `registerSchemaBlock(...)` runs when
 * the schema registry is loaded (client or collab server).
 *
 * Keep this module free of React and client-only code beyond what the
 * TipTap node modules already import.
 */
import { Decision } from "../decision/decision";
import { DecisionCatalog } from "../decision/decision-catalog";
import { registerSchemaBlock } from "./registry";

registerSchemaBlock(Decision);
registerSchemaBlock(DecisionCatalog);
