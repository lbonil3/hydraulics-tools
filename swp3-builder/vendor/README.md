# Vendored libraries

- `pdf-lib.min.js`: pdf-lib 1.17.1, MIT license, Copyright (c) 2019 Andrew Dillon (`pdf-lib-LICENSE.md`). It writes the filled Summary Sheet PDF in the browser. The minified file also carries Microsoft's tslib header (Apache-2.0, "Copyright (c) Microsoft Corporation"), which must stay with it. Source: https://github.com/Hopding/pdf-lib (npm package `pdf-lib`).

It is loaded from this folder, not from a CDN, and is in the service worker cache so export works offline.
