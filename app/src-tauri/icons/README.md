# icons

TODO: `icon.png` is referenced by `tauri.conf.json` (`bundle.icon`) but is NOT
committed yet. The **frontend** build (`bun run build`) does not need it.

To produce the full icon set before a desktop bundle:

```sh
# from app/
bun run tauri icon path/to/source-1024.png
```

This generates `icon.png`, `icon.icns`, `icon.ico`, and the platform PNGs here.
