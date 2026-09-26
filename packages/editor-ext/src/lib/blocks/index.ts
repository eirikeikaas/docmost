export {
  registerSchemaBlock,
  getSchemaExtensions,
  clearSchemaBlocksForTests,
} from "./registry";

// Side-effect registrations for first-party schema blocks.
import "./entries";
