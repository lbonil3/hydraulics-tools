# Bid Estimator

Suggested unit price, low/mid/high range, total and plain-language reasons for a TxDOT bid code at a given quantity, from TxDOT Open Data Bid Tabulations (Socrata `de7b-7dna`). Planning-level only.

- `estimator.js` — pure statistics and estimation logic (browser + node).
- `charts.js` — inline SVG scatter (price vs log quantity) and box plot.
- `app.js`, `index.html`, `estimator.css` — page; line items are saved in localStorage.
- Deep link: `/bid-estimator/?code=5002-7001&qty=12000[&scope=houston|statewide]`.

Regenerate data (the raw pull is not committed):

```
node bid-estimator/scripts/fetch-bids.js /tmp/estimator-raw/lowbid.ndjson   # optional SOCRATA_APP_TOKEN
node bid-estimator/scripts/build-data.js /tmp/estimator-raw/lowbid.ndjson
node bid-estimator/test.js
```

`data/index.json` holds the search index, county/district lookups, the pooled price-vs-quantity slope and meta. `data/items/<item>.json` holds, per bid code, every low-bid observation `[qty, price, engEst, letDate, countyIdx, districtIdx, projectIdx, nBidders, avgAllBids]` plus Houston and statewide statistics (percentiles, means, quantity bands, engineer's-estimate ratio, log-log fit, trend, outliers).
