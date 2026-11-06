import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/"))
      specifier = pathToFileURL(
        path.join(root, "src", specifier.slice(2)),
      ).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith(".") || specifier.startsWith("file:")) &&
        !path.extname(specifier)
      ) {
        try {
          return next(specifier + ".ts", context);
        } catch {
          try {
            return next(specifier + "/index.ts", context);
          } catch {
            /* Preserve original resolution error. */
          }
        }
      }
      throw error;
    }
  },
});
