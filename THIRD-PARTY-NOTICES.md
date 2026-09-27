# Third-Party Notices

## ZViewer

The adapted modules in `src/upstream` and the inherited public assets originate
from Zero-wyc/ZViewer 4.1.7. Preserve the original copyright notice and MIT terms
in [UPSTREAM-LICENSE](UPSTREAM-LICENSE).

## Mediabunny

The local fork in `vendor/mediabunny` identifies itself as version 1.38.1, based
on the kzahel/mediabunny integration branch. Its modules retain their original
copyright and Mozilla Public License 2.0 headers. See
[LICENSE](vendor/mediabunny/LICENSE) and
[LOCAL-PATCHES.md](vendor/mediabunny/LOCAL-PATCHES.md) for modifications.

The editable JavaScript modules, including local modifications, are distributed
in this repository at `vendor/mediabunny/dist/modules/src`. They must be included
in source distributions even though their parent directory is named `dist`.

## Other Dependencies

Dependency versions and origins are recorded in `package-lock.json`. React,
Capacitor, the media players, codec resources, fonts and other bundled components
retain their respective licenses and copyright notices. The ZViewer MIT license
does not replace any third-party license.
